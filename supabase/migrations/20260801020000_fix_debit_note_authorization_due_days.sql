create or replace function public.finalize_debit_note_authorization(
  p_debit_note_id uuid,
  p_organization_id uuid,
  p_point_of_sale integer,
  p_voucher_type_code integer,
  p_voucher_number integer,
  p_cae text,
  p_cae_expires_at timestamptz,
  p_associated_voucher_type_code integer,
  p_associated_point_of_sale integer,
  p_associated_voucher_number integer,
  p_associated_voucher_date date,
  p_request_json jsonb,
  p_response_json jsonb
)
returns jsonb
language plpgsql
as $$
declare
  note_row public.debit_notes%rowtype;
  receivable_row public.accounts_receivable%rowtype;
  due_days integer;
  next_total numeric;
  next_pending numeric;
  next_status public.receivable_status;
  resolved_receivable_id uuid;
begin
  select * into note_row
    from public.debit_notes
   where id = p_debit_note_id and organization_id = p_organization_id
   for update;

  if not found then
    raise exception 'Nota de débito no encontrada';
  end if;
  if note_row.status = 'authorized' then
    return jsonb_build_object('idempotent', true, 'account_receivable_id', note_row.account_receivable_id);
  end if;
  if note_row.status not in ('pending', 'verifying') then
    raise exception 'La nota de débito no está lista para finalizar su autorización';
  end if;

  select * into receivable_row
    from public.accounts_receivable
   where organization_id = p_organization_id and sales_order_id = note_row.sales_order_id
   for update;

  if found then
    next_total := round(coalesce(receivable_row.total_amount, 0) + note_row.amount, 2);
    next_pending := round(coalesce(receivable_row.pending_balance, 0) + note_row.amount, 2);
    next_status := case
      when next_pending <= 0 then 'PAID'::public.receivable_status
      when next_pending < next_total then 'PARTIALLY_PAID'::public.receivable_status
      else 'PENDING'::public.receivable_status
    end;
    update public.accounts_receivable
       set total_amount = next_total,
           pending_balance = next_pending,
           status = next_status,
           updated_at = now()
     where id = receivable_row.id;
    resolved_receivable_id := receivable_row.id;
  else
    select coalesce(customer_row.due_days, 0)
      into due_days
      from public.customers customer_row
     where customer_row.id = note_row.customer_id;
    insert into public.accounts_receivable (
      organization_id, customer_id, sales_order_id, total_amount, pending_balance, due_date, status, updated_at
    ) values (
      p_organization_id, note_row.customer_id, note_row.sales_order_id,
      note_row.amount, note_row.amount, note_row.issue_date + coalesce(due_days, 0), 'PENDING', now()
    ) returning id into resolved_receivable_id;
  end if;

  update public.debit_notes
     set status = 'authorized',
         arca_cae = p_cae,
         arca_cae_expires_at = p_cae_expires_at,
         arca_authorized_at = now(),
         arca_point_of_sale = p_point_of_sale,
         arca_voucher_type_code = p_voucher_type_code,
         arca_voucher_number = p_voucher_number,
         arca_reserved_voucher_number = p_voucher_number,
         arca_associated_voucher_type_code = p_associated_voucher_type_code,
         arca_associated_point_of_sale = p_associated_point_of_sale,
         arca_associated_voucher_number = p_associated_voucher_number,
         arca_associated_voucher_date = p_associated_voucher_date,
         arca_request_json = p_request_json,
         arca_response_json = p_response_json,
         arca_last_error = null,
         account_receivable_id = resolved_receivable_id,
         financial_applied_at = now(),
         updated_at = now()
   where id = note_row.id;

  insert into public.debit_note_events (organization_id, debit_note_id, event_type, from_status, to_status, actor_id, metadata)
  values (p_organization_id, note_row.id, 'authorized', note_row.status, 'authorized', auth.uid(),
    jsonb_build_object('voucher_number', p_voucher_number, 'cae', p_cae, 'account_receivable_id', resolved_receivable_id));

  return jsonb_build_object('idempotent', false, 'account_receivable_id', resolved_receivable_id);
end;
$$;

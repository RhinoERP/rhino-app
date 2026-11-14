-- Manual credit notes may either settle their referenced receivable or remain
-- available as customer credit. Keep the choice and the resulting amount on
-- the credit note so the financial treatment remains auditable.
ALTER TABLE public.credit_notes
  ADD COLUMN IF NOT EXISTS apply_to_receivable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS applied_to_receivable_amount numeric NOT NULL DEFAULT 0;

ALTER TABLE public.credit_notes
  DROP CONSTRAINT IF EXISTS credit_notes_applied_to_receivable_amount_check;

ALTER TABLE public.credit_notes
  ADD CONSTRAINT credit_notes_applied_to_receivable_amount_check
  CHECK (
    applied_to_receivable_amount >= 0
    AND applied_to_receivable_amount <= amount
  );

-- The credit row is locked before reading its remaining amount. This makes a
-- retry idempotent and serializes concurrent attempts to settle the same NC.
CREATE OR REPLACE FUNCTION public.apply_credit_note_to_receivable(
  p_credit_note_id uuid,
  p_organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_note public.credit_notes%ROWTYPE;
  v_credit public.customer_credits%ROWTYPE;
  v_receivable public.accounts_receivable%ROWTYPE;
  v_amount numeric;
  v_pending numeric;
  v_status public.receivable_status;
BEGIN
  SELECT * INTO v_note
  FROM public.credit_notes
  WHERE id = p_credit_note_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nota de crédito no encontrada';
  END IF;

  IF NOT v_note.apply_to_receivable
    OR v_note.sales_order_id IS NULL
    OR v_note.sales_return_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'applied_amount', 0,
      'remaining_credit_amount', NULL,
      'account_receivable_id', NULL
    );
  END IF;

  IF v_note.applied_to_receivable_amount > 0 THEN
    SELECT remaining_amount INTO v_amount
    FROM public.customer_credits
    WHERE organization_id = p_organization_id
      AND credit_note_id = p_credit_note_id
    ORDER BY created_at ASC
    LIMIT 1;

    RETURN jsonb_build_object(
      'applied_amount', v_note.applied_to_receivable_amount,
      'remaining_credit_amount', coalesce(v_amount, 0),
      'account_receivable_id', NULL
    );
  END IF;

  SELECT * INTO v_credit
  FROM public.customer_credits
  WHERE organization_id = p_organization_id
    AND credit_note_id = p_credit_note_id
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró el saldo a favor de la nota de crédito';
  END IF;

  SELECT * INTO v_receivable
  FROM public.accounts_receivable
  WHERE organization_id = p_organization_id
    AND sales_order_id = v_note.sales_order_id
  FOR UPDATE;

  IF NOT FOUND OR coalesce(v_receivable.pending_balance, 0) <= 0 THEN
    RETURN jsonb_build_object(
      'applied_amount', 0,
      'remaining_credit_amount', v_credit.remaining_amount,
      'account_receivable_id', NULL
    );
  END IF;

  v_amount := round(least(v_credit.remaining_amount, v_receivable.pending_balance), 2);
  v_pending := round(greatest(v_receivable.pending_balance - v_amount, 0), 2);
  v_status := CASE
    WHEN v_pending <= 0 THEN 'PAID'::public.receivable_status
    WHEN v_pending < v_receivable.total_amount THEN 'PARTIALLY_PAID'::public.receivable_status
    ELSE 'PENDING'::public.receivable_status
  END;

  UPDATE public.customer_credits
  SET remaining_amount = round(greatest(v_credit.remaining_amount - v_amount, 0), 2)
  WHERE id = v_credit.id;

  UPDATE public.accounts_receivable
  SET pending_balance = v_pending,
      status = v_status,
      updated_at = now()
  WHERE id = v_receivable.id;

  INSERT INTO public.customer_credit_applications (
    organization_id,
    customer_id,
    customer_credit_id,
    account_receivable_id,
    amount,
    payment_date,
    notes
  ) VALUES (
    p_organization_id,
    v_note.customer_id,
    v_credit.id,
    v_receivable.id,
    v_amount,
    current_date,
    'Aplicación automática de Nota de Crédito ' || coalesce(v_note.credit_note_number, v_note.id::text)
  );

  UPDATE public.credit_notes
  SET applied_to_receivable_amount = v_amount,
      updated_at = now()
  WHERE id = v_note.id;

  RETURN jsonb_build_object(
    'applied_amount', v_amount,
    'remaining_credit_amount', round(greatest(v_credit.remaining_amount - v_amount, 0), 2),
    'account_receivable_id', v_receivable.id
  );
END;
$$;

-- A debit note paid in cash is fiscal only: it must not create debt.
CREATE OR REPLACE FUNCTION public.finalize_debit_note_authorization(
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
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  note_row public.debit_notes%rowtype;
  receivable_row public.accounts_receivable%rowtype;
  due_days integer;
  next_total numeric;
  next_pending numeric;
  next_status public.receivable_status;
  resolved_receivable_id uuid;
BEGIN
  SELECT * INTO note_row
  FROM public.debit_notes
  WHERE id = p_debit_note_id AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nota de débito no encontrada';
  END IF;
  IF note_row.status = 'authorized' THEN
    RETURN jsonb_build_object('idempotent', true, 'account_receivable_id', note_row.account_receivable_id);
  END IF;
  IF note_row.status NOT IN ('pending', 'verifying') THEN
    RAISE EXCEPTION 'La nota de débito no está lista para finalizar su autorización';
  END IF;

  IF note_row.payment_condition = 'CURRENT_ACCOUNT' THEN
    SELECT * INTO receivable_row
    FROM public.accounts_receivable
    WHERE organization_id = p_organization_id
      AND sales_order_id = note_row.sales_order_id
    FOR UPDATE;

    IF FOUND THEN
      next_total := round(coalesce(receivable_row.total_amount, 0) + note_row.amount, 2);
      next_pending := round(coalesce(receivable_row.pending_balance, 0) + note_row.amount, 2);
      next_status := CASE
        WHEN next_pending <= 0 THEN 'PAID'::public.receivable_status
        WHEN next_pending < next_total THEN 'PARTIALLY_PAID'::public.receivable_status
        ELSE 'PENDING'::public.receivable_status
      END;
      UPDATE public.accounts_receivable
      SET total_amount = next_total,
          pending_balance = next_pending,
          status = next_status,
          updated_at = now()
      WHERE id = receivable_row.id;
      resolved_receivable_id := receivable_row.id;
    ELSE
      SELECT coalesce(customer_row.due_days, 0)
      INTO due_days
      FROM public.customers customer_row
      WHERE customer_row.id = note_row.customer_id;

      INSERT INTO public.accounts_receivable (
        organization_id, customer_id, sales_order_id, total_amount, pending_balance, due_date, status, updated_at
      ) VALUES (
        p_organization_id, note_row.customer_id, note_row.sales_order_id,
        note_row.amount, note_row.amount, note_row.issue_date + coalesce(due_days, 0), 'PENDING', now()
      ) RETURNING id INTO resolved_receivable_id;
    END IF;
  END IF;

  UPDATE public.debit_notes
  SET status = 'authorized',
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
  WHERE id = note_row.id;

  INSERT INTO public.debit_note_events (organization_id, debit_note_id, event_type, from_status, to_status, actor_id, metadata)
  VALUES (
    p_organization_id, note_row.id, 'authorized', note_row.status, 'authorized', auth.uid(),
    jsonb_build_object('voucher_number', p_voucher_number, 'cae', p_cae, 'account_receivable_id', resolved_receivable_id)
  );

  RETURN jsonb_build_object('idempotent', false, 'account_receivable_id', resolved_receivable_id);
END;
$$;

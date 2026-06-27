delete from public.customer_credits cc
where cc.credit_note_id in (
  select cn.id
  from public.credit_notes cn
  where cn.origin_type = 'RETURN'
    and cn.sales_return_id is null
);

delete from public.credit_notes cn
where cn.origin_type = 'RETURN'
  and cn.sales_return_id is null;

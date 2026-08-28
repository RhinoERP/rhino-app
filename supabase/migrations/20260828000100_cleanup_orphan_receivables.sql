-- Limpia cuentas por cobrar huérfanas generadas por el bug del RPC
-- update_sale_order_atomic (ver migration 20260828000000_...).
-- Borra ARs de ventas STANDARD que nunca fueron despachadas y que no tienen
-- pagos ni referencias (notas de débito, anticipos, aplicaciones de crédito,
-- pagos POS). Se conservan los documentos ADVANCE/BALANCE (anticipos y saldos
-- de preventa), que sí representan deuda real.
--
-- La exclusión de debit_notes es condicional a la existencia de la columna
-- debit_notes.account_receivable_id, que difiere entre entornos (PROD la tiene,
-- DEV usa sales_order_id). Así la migration es portable.
do $$
declare
  v_sql text;
begin
  v_sql := $q$
    delete from public.accounts_receivable ar
    where coalesce(ar.is_collection_deferred, false) = false
      and not exists (
        select 1
        from public.receivable_payments rp
        where rp.account_receivable_id = ar.id
      )
      and not exists (
        select 1
        from public.sales_advances sa
        where sa.advance_receivable_id = ar.id
           or sa.final_receivable_id = ar.id
      )
      and not exists (
        select 1
        from public.customer_credit_applications cca
        where cca.account_receivable_id = ar.id
      )
      and not exists (
        select 1
        from public.pos_payments pp
        where pp.generated_receivable_id = ar.id
      )
      and exists (
        select 1
        from public.sales_orders so
        where so.id = ar.sales_order_id
          and so.status not in ('DISPATCH', 'DELIVERED')
          and so.document_type = 'STANDARD'
      )
  $q$;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'debit_notes'
      and column_name = 'account_receivable_id'
  ) then
    v_sql := v_sql || ' and not exists (select 1 from public.debit_notes dn where dn.account_receivable_id = ar.id)';
  end if;

  execute v_sql;
end
$$;

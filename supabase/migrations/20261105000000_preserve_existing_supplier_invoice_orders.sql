-- Existing links remain valid if an OC is later cancelled or becomes a draft.
-- Only newly added links must pass the availability checks.
begin;

create or replace function public.set_supplier_invoice_orders_internal(p_invoice uuid, p_orders uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare i public.supplier_invoices%rowtype; o public.purchase_orders%rowtype; ids uuid[]; previous uuid[];
begin
  select * into strict i from public.supplier_invoices where id = p_invoice for update;
  ids := array(select distinct x from unnest(coalesce(p_orders, '{}'::uuid[])) x order by x);
  if exists (select 1 from unnest(ids) x where x is null) or cardinality(ids) > 100 then
    raise exception 'Selección de OC inválida'; end if;
  if i.payable_model <> 'INVOICE' then raise exception 'Solo se modifican vínculos de facturas directas'; end if;
  if i.status <> 'REGISTERED' then raise exception 'La factura no está registrada'; end if;
  select coalesce(array_agg(purchase_order_id order by purchase_order_id),'{}') into previous
    from public.supplier_invoice_purchase_orders where supplier_invoice_id = i.id;
  for o in select * from public.purchase_orders where id = any(ids) order by id loop
    if o.organization_id <> i.organization_id or o.supplier_id is distinct from i.supplier_id then
      raise exception 'OC no válida para esta factura'; end if;
    -- Tenant/supplier identity is always checked, including preserved links.
    if o.status::text in ('CANCELLED','DRAFT') and not (o.id = any(previous)) then
      raise exception 'OC no válida para esta factura'; end if;
    if exists(select 1 from public.purchase_order_invoice_currencies c
      where c.purchase_order_id=o.id and (c.currency<>i.currency or c.organization_id<>i.organization_id)) then
      raise exception 'La moneda de facturación fijada para la OC es incompatible';
    end if;
    if exists (select 1 from public.accounts_payable a where a.purchase_order_id = o.id
        and not exists (select 1 from public.supplier_invoices l where l.purchase_order_id = o.id
          and l.payable_model = 'LEGACY_OC' and l.status = 'REGISTERED')) then
      raise exception 'La OC conserva deuda provisional; requiere conciliación explícita';
    end if;
    if exists (select 1 from public.supplier_invoices other
      where other.id <> i.id and other.status = 'REGISTERED' and other.currency <> i.currency
        and (other.purchase_order_id = o.id or exists (
          select 1 from public.supplier_invoice_purchase_orders link
          where link.supplier_invoice_id = other.id and link.purchase_order_id = o.id))) then
      raise exception 'La moneda de facturación de la OC es incompatible';
    end if;
  end loop;
  if (select count(*) from public.purchase_orders where id = any(ids)) <> cardinality(ids) then
    raise exception 'OC no encontrada'; end if;
  insert into public.purchase_order_invoice_currencies(purchase_order_id,organization_id,currency,first_invoice_id)
    select x,i.organization_id,i.currency,i.id from unnest(ids) x on conflict do nothing;
  delete from public.supplier_invoice_purchase_orders where supplier_invoice_id = i.id;
  insert into public.supplier_invoice_purchase_orders (organization_id, supplier_invoice_id, purchase_order_id, created_by)
    select i.organization_id, i.id, x, auth.uid() from unnest(ids) x;
  if previous <> ids then
    insert into public.supplier_invoice_link_events(organization_id,supplier_invoice_id,previous_orders,next_orders,created_by)
      values(i.organization_id,i.id,previous,ids,auth.uid());
  end if;
end $$;

revoke all on function public.set_supplier_invoice_orders_internal(uuid,uuid[]) from public,anon,authenticated;
commit;

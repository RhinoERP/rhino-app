-- Close the nullable-document cutover before enabling wholesale selectors.
-- These triggers only resolve/freeze location. They never reserve or move stock.

begin;

-- Compatibility for documents created by old writers after the first backfill.
update public.quotes q set warehouse_id = w.id
from public.warehouses w
where q.organization_id = w.organization_id and w.is_default
  and q.warehouse_id is null;
update public.sales_orders s set warehouse_id = w.id
from public.warehouses w
where s.organization_id = w.organization_id and w.is_default
  and s.warehouse_id is null;
update public.orders o set warehouse_id = w.id
from public.warehouses w
where o.organization_id = w.organization_id and w.is_default
  and o.warehouse_id is null;

create function public.enforce_quote_warehouse()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.warehouse_id is not distinct from old.warehouse_id then
      return new;
    end if;
    if old.status::text = 'CONVERTED' or exists (
      select 1 from public.orders o
      where o.quote_id = old.id and o.organization_id = old.organization_id
    ) then
      raise exception 'El depósito del presupuesto queda fijo al crear el pedido';
    end if;
  end if;

  if new.warehouse_id is null then
    select w.id into new.warehouse_id from public.warehouses w
    where w.organization_id = new.organization_id and w.is_default;
  end if;
  if not exists (
    select 1 from public.warehouses w
    where w.id = new.warehouse_id and w.organization_id = new.organization_id
      and w.is_active and w.wholesale_enabled
  ) then
    raise exception 'El presupuesto requiere un depósito activo habilitado para mayorista';
  end if;
  return new;
end;
$$;

create function public.enforce_order_warehouse()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_expected uuid;
  v_sale_warehouse uuid;
begin
  if tg_op = 'UPDATE' then
    if new.warehouse_id is distinct from old.warehouse_id
      or new.organization_id is distinct from old.organization_id then
      raise exception 'No se puede cambiar el depósito ni la organización de un pedido';
    end if;
  end if;

  if new.parent_order_id is not null then
    select o.warehouse_id into v_expected from public.orders o
    where o.id = new.parent_order_id and o.organization_id = new.organization_id;
    if not found then raise exception 'Pedido padre ajeno a la organización'; end if;
  else
    select q.warehouse_id into v_expected from public.quotes q
    where q.id = new.quote_id and q.organization_id = new.organization_id;
    if not found then raise exception 'Presupuesto ajeno a la organización'; end if;
  end if;

  if v_expected is null then
    raise exception 'El documento de origen no tiene depósito';
  end if;
  if new.warehouse_id is not null and new.warehouse_id <> v_expected then
    raise exception 'El pedido debe usar el depósito del documento de origen';
  end if;
  new.warehouse_id := v_expected;

  if new.sales_order_id is not null then
    select s.warehouse_id into v_sale_warehouse from public.sales_orders s
    where s.id = new.sales_order_id and s.organization_id = new.organization_id;
    if not found or v_sale_warehouse is distinct from v_expected then
      raise exception 'La venta vinculada debe usar el mismo depósito que el pedido';
    end if;
  end if;
  return new;
end;
$$;

create function public.enforce_sale_warehouse()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_expected uuid;
  v_quote_id uuid;
begin
  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id then
      raise exception 'No se puede cambiar la organización de una venta';
    end if;
    if new.warehouse_id is distinct from old.warehouse_id
      and old.status::text <> 'DRAFT' then
      raise exception 'El depósito de la venta queda fijo al confirmarla';
    end if;
  end if;

  -- Linked sales may still be DRAFT but their warehouse belongs to the order.
  select o.warehouse_id into v_expected from public.orders o
  where o.sales_order_id = new.id and o.organization_id = new.organization_id
  order by o.parent_order_id nulls first limit 1;

  -- Conversion creates the sale before the order; resolve its quote snapshot.
  if v_expected is null then
    v_quote_id := nullif(new.commercial_snapshot->>'quoteId', '')::uuid;
    if v_quote_id is not null then
      select q.warehouse_id into v_expected from public.quotes q
      where q.id = v_quote_id and q.organization_id = new.organization_id;
      if not found then raise exception 'Presupuesto de venta ajeno a la organización'; end if;
    end if;
  end if;

  if v_expected is not null then
    if new.warehouse_id is not null and new.warehouse_id <> v_expected then
      raise exception 'La venta debe usar el depósito de su pedido o presupuesto';
    end if;
    new.warehouse_id := v_expected;
  elsif new.warehouse_id is null then
    select w.id into new.warehouse_id from public.warehouses w
    where w.organization_id = new.organization_id and w.is_default;
  end if;

  if new.warehouse_id is null then
    raise exception 'La venta requiere un depósito';
  end if;
  return new;
end;
$$;

create trigger enforce_quote_warehouse_before_write
  before insert or update on public.quotes for each row
  execute function public.enforce_quote_warehouse();
create trigger enforce_order_warehouse_before_write
  before insert or update on public.orders for each row
  execute function public.enforce_order_warehouse();
create trigger enforce_sale_warehouse_before_write
  before insert or update on public.sales_orders for each row
  execute function public.enforce_sale_warehouse();

alter table public.quotes alter column warehouse_id set not null;
alter table public.orders alter column warehouse_id set not null;
alter table public.sales_orders alter column warehouse_id set not null;

revoke all on function public.enforce_quote_warehouse() from public, anon, authenticated;
revoke all on function public.enforce_order_warehouse() from public, anon, authenticated;
revoke all on function public.enforce_sale_warehouse() from public, anon, authenticated;

commit;

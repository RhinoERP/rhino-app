-- Phase 2: persist the operational warehouse on every document that owns
-- a stock decision. Existing documents predate multi-warehouse and inherit
-- their organization's principal warehouse. Nullable during the application
-- cutover: the app must explicitly set it before warehouse selection is live.

alter table public.quotes add column warehouse_id uuid;
alter table public.orders add column warehouse_id uuid;
alter table public.sales_orders add column warehouse_id uuid;
alter table public.pos_sessions add column warehouse_id uuid;
alter table public.purchase_receipts add column warehouse_id uuid;

update public.quotes q set warehouse_id = w.id
from public.warehouses w
where w.organization_id = q.organization_id and w.is_default;
update public.orders o set warehouse_id = w.id
from public.warehouses w
where w.organization_id = o.organization_id and w.is_default;
update public.sales_orders s set warehouse_id = w.id
from public.warehouses w
where w.organization_id = s.organization_id and w.is_default;
update public.pos_sessions s set warehouse_id = w.id
from public.warehouses w
where w.organization_id = s.organization_id and w.is_default;
update public.purchase_receipts r set warehouse_id = w.id
from public.warehouses w
where w.organization_id = r.organization_id and w.is_default;

alter table public.quotes
  add constraint quotes_warehouse_org_fk
  foreign key (warehouse_id, organization_id)
  references public.warehouses(id, organization_id);
alter table public.orders
  add constraint orders_warehouse_org_fk
  foreign key (warehouse_id, organization_id)
  references public.warehouses(id, organization_id);
alter table public.sales_orders
  add constraint sales_orders_warehouse_org_fk
  foreign key (warehouse_id, organization_id)
  references public.warehouses(id, organization_id);
alter table public.pos_sessions
  add constraint pos_sessions_warehouse_org_fk
  foreign key (warehouse_id, organization_id)
  references public.warehouses(id, organization_id);
alter table public.purchase_receipts
  add constraint purchase_receipts_warehouse_org_fk
  foreign key (warehouse_id, organization_id)
  references public.warehouses(id, organization_id);

create index quotes_org_warehouse on public.quotes (organization_id, warehouse_id);
create index orders_org_warehouse on public.orders (organization_id, warehouse_id);
create index sales_orders_org_warehouse on public.sales_orders (organization_id, warehouse_id);
create index pos_sessions_org_warehouse on public.pos_sessions (organization_id, warehouse_id);
create index purchase_receipts_org_warehouse
  on public.purchase_receipts (organization_id, warehouse_id);

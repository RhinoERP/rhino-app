-- Existing operators retain access to the warehouse that held their stock
-- before multi-warehouse. Future revocations must not be automatically undone.
insert into public.warehouse_user_assignments (
  organization_id, warehouse_id, user_id
)
select m.organization_id, w.id, m.user_id
from public.organization_members m
join public.warehouses w on w.organization_id = m.organization_id
  and w.is_default
where m.is_active
on conflict (organization_id, warehouse_id, user_id) do nothing;

-- Receipts/sessions created during the nullable cutover can predate app changes.
update public.pos_sessions s set warehouse_id = w.id
from public.warehouses w
where s.organization_id = w.organization_id and w.is_default
  and s.warehouse_id is null;

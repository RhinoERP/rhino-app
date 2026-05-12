insert into public.permissions (key, description)
select 'creditnotes.read', 'Permite ver notas de crédito.'
where not exists (
  select 1
  from public.permissions
  where key = 'creditnotes.read'
);

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'creditnotes.read'
where r.key = 'admin'
  and not exists (
    select 1
    from public.role_permissions rp
    where rp.role_id = r.id
      and rp.permission_id = p.id
  );

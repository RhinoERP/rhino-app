-- Administrative writes are exposed through permission-checked RPCs instead
-- of broadening the existing read-only warehouse/assignment RLS policies.
begin;

create function public.assert_warehouse_admin(p_org_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_member public.organization_members%rowtype;
begin
  if auth.uid() is null then raise exception 'Usuario no autenticado'; end if;
  select * into v_member from public.organization_members
    where organization_id = p_org_id and user_id = auth.uid() and is_active;
  if not found then raise exception 'Sin acceso a la organización'; end if;
  if not v_member.is_owner and not exists (
    select 1 from public.roles r
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions permission on permission.id = rp.permission_id
    where r.id = v_member.role_id and r.organization_id = p_org_id
      and permission.key = 'organization.admin'
  ) then
    raise exception 'Se requiere permiso de administrador de la organización';
  end if;
end;
$$;

create function public.save_warehouse(
  p_org_id uuid, p_name text, p_code text default null,
  p_is_active boolean default true, p_wholesale_enabled boolean default true,
  p_direct_sale_enabled boolean default true, p_warehouse_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  perform public.assert_warehouse_admin(p_org_id);
  if nullif(btrim(p_name), '') is null
    or p_is_active is null or p_wholesale_enabled is null
    or p_direct_sale_enabled is null then
    raise exception 'Nombre, estado y canales del depósito son requeridos';
  end if;
  if not (p_wholesale_enabled or p_direct_sale_enabled) then
    raise exception 'Habilitá al menos un canal para el depósito';
  end if;
  if p_warehouse_id is null then
    insert into public.warehouses (
      organization_id, name, code, is_active,
      wholesale_enabled, direct_sale_enabled
    ) values (
      p_org_id, btrim(p_name), nullif(btrim(p_code), ''), p_is_active,
      p_wholesale_enabled, p_direct_sale_enabled
    ) returning id into v_id;
  else
    -- The principal marker is not editable through this metadata operation.
    -- No existing balance/document is reassigned when a warehouse is edited.
    update public.warehouses set name = btrim(p_name),
      code = nullif(btrim(p_code), ''), is_active = p_is_active,
      wholesale_enabled = p_wholesale_enabled,
      direct_sale_enabled = p_direct_sale_enabled, updated_at = now()
    where id = p_warehouse_id and organization_id = p_org_id
    returning id into v_id;
    if not found then raise exception 'Depósito no encontrado en esta organización'; end if;
  end if;
  return v_id;
end;
$$;

-- Replace one member's complete warehouse selection in a single transaction.
-- Inactive warehouse assignments can be retained for historical access; the
-- operational selectors and movement RPCs still require an active destination.
create function public.replace_warehouse_user_assignments(
  p_org_id uuid, p_user_id uuid, p_warehouse_ids uuid[]
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_count bigint;
begin
  perform public.assert_warehouse_admin(p_org_id);
  if p_user_id is null or p_warehouse_ids is null then
    raise exception 'Usuario y selección de depósitos requeridos';
  end if;
  if exists (select 1 from unnest(p_warehouse_ids) as ids(id) where id is null)
    or cardinality(p_warehouse_ids) <>
      (select count(distinct id) from unnest(p_warehouse_ids) as ids(id)) then
    raise exception 'La selección contiene depósitos repetidos o inválidos';
  end if;
  -- Serialize replacement for the same user without locking every member.
  perform 1 from public.organization_members
    where organization_id = p_org_id and user_id = p_user_id and is_active
    for update;
  if not found then raise exception 'El usuario no es miembro activo de la organización'; end if;
  perform 1 from public.warehouses
    where organization_id = p_org_id and id = any(p_warehouse_ids) for share;
  get diagnostics v_count = row_count;
  if v_count <> cardinality(p_warehouse_ids) then
    raise exception 'Uno o más depósitos no pertenecen a la organización';
  end if;

  delete from public.warehouse_user_assignments
    where organization_id = p_org_id and user_id = p_user_id;
  insert into public.warehouse_user_assignments (
    organization_id, warehouse_id, user_id
  ) select p_org_id, id, p_user_id from unnest(p_warehouse_ids) as ids(id);
end;
$$;

-- Continue the initial principal-warehouse backfill for newly added members.
-- This is insert-only: reactivation does not undo explicit access revocations.
create function public.assign_principal_warehouse_to_new_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.warehouse_user_assignments (
    organization_id, warehouse_id, user_id
  ) select new.organization_id, w.id, new.user_id from public.warehouses w
    where w.organization_id = new.organization_id and w.is_default
  on conflict (organization_id, warehouse_id, user_id) do nothing;
  return new;
end;
$$;
create trigger assign_principal_warehouse_on_membership_insert
  after insert on public.organization_members for each row
  when (new.is_active)
  execute function public.assign_principal_warehouse_to_new_member();

revoke all on function public.assert_warehouse_admin(uuid)
  from public, anon, authenticated;
revoke all on function public.assign_principal_warehouse_to_new_member()
  from public, anon, authenticated;
revoke all on function public.save_warehouse(uuid, text, text, boolean, boolean, boolean, uuid)
  from public, anon, authenticated;
revoke all on function public.replace_warehouse_user_assignments(uuid, uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.save_warehouse(uuid, text, text, boolean, boolean, boolean, uuid)
  to authenticated;
grant execute on function public.replace_warehouse_user_assignments(uuid, uuid, uuid[])
  to authenticated;

commit;

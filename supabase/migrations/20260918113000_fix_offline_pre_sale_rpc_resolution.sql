-- pgcrypto is installed in the extensions schema. The original fixed
-- search_path prevented digest() from resolving at runtime.
alter function public.create_offline_pre_sale_atomic(jsonb)
  set search_path = public, extensions;

-- The canonical permission helper receives organization first. Keep this
-- overload for RPCs that use the permission-first convention.
create or replace function public.user_has_org_permission(
  p_permission_key text,
  p_target_org_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.user_has_org_permission(
    target_org_id => p_target_org_id,
    permission_key => p_permission_key
  );
$$;

revoke all on function public.user_has_org_permission(text, uuid) from public;
grant execute on function public.user_has_org_permission(text, uuid) to authenticated;

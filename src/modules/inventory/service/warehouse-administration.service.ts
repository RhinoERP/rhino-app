import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import {
  type ReplaceWarehouseAssignmentsInput,
  replaceWarehouseAssignmentsSchema,
  type SaveWarehouseInput,
  saveWarehouseSchema,
  type WarehouseAdministrationData,
} from "../warehouse-admin.types";

async function collectPages<T>(
  readPage: (
    from: number,
    to: number
  ) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
  label: string
): Promise<T[]> {
  const result: T[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await readPage(offset, offset + pageSize - 1);
    if (error || !data) {
      throw new Error(
        `No se pudieron consultar ${label}: ${error?.message ?? "sin datos"}`
      );
    }
    result.push(...data);
    if (data.length < pageSize) {
      return result;
    }
  }
}

async function resolveOrganization(orgSlug: string) {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }
  return org;
}

export async function getWarehouseAdministrationData(
  orgSlug: string
): Promise<WarehouseAdministrationData> {
  const org = await resolveOrganization(orgSlug);
  const supabase = await createClient();
  const [warehouses, assignments, members, adminRoles] = await Promise.all([
    collectPages(
      (from, to) =>
        supabase
          .from("warehouses")
          .select("*")
          .eq("organization_id", org.id)
          .order("is_default", { ascending: false })
          .order("name")
          .order("id")
          .range(from, to),
      "los depósitos"
    ),
    collectPages(
      (from, to) =>
        supabase
          .from("warehouse_user_assignments")
          .select("user_id, warehouse_id")
          .eq("organization_id", org.id)
          .order("user_id")
          .order("warehouse_id")
          .range(from, to),
      "las asignaciones"
    ),
    collectPages(
      (from, to) =>
        supabase
          .rpc("get_organization_members_with_users", {
            org_slug_param: orgSlug,
          })
          .order("user_id")
          .range(from, to),
      "los miembros"
    ),
    collectPages(
      (from, to) =>
        supabase
          .from("role_permissions")
          .select(
            "role_id, permission:permissions!role_permissions_permission_id_fkey!inner(key), role:roles!role_permissions_role_id_fkey!inner(organization_id)"
          )
          .eq("role.organization_id", org.id)
          .eq("permission.key", "organization.admin")
          .order("role_id")
          .range(from, to),
      "los permisos administrativos"
    ),
  ]);
  const adminRoleIds = new Set(adminRoles.map((row) => row.role_id));
  return {
    warehouses,
    members: members
      .filter((member) => member.is_active && member.organization_id === org.id)
      .map((member) => ({
        userId: member.user_id,
        name: member.full_name || member.email || "Usuario",
        email: member.email ?? null,
        roleName: member.role_name ?? "Sin rol",
        hasAllAccess: member.is_owner || adminRoleIds.has(member.role_id),
        warehouseIds: assignments
          .filter((row) => row.user_id === member.user_id)
          .map((row) => row.warehouse_id),
      })),
  };
}

export async function saveManagedWarehouse(
  input: SaveWarehouseInput
): Promise<string> {
  const values = saveWarehouseSchema.parse(input);
  const org = await resolveOrganization(values.orgSlug);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_warehouse", {
    p_org_id: org.id,
    p_warehouse_id: values.warehouseId,
    p_name: values.name,
    p_code: values.code || undefined,
    p_is_active: values.isActive,
    p_wholesale_enabled: values.wholesaleEnabled,
    p_direct_sale_enabled: values.directSaleEnabled,
  });
  if (error || !data) {
    throw new Error(error?.message ?? "No se pudo guardar el depósito");
  }
  return data;
}

export async function replaceManagedWarehouseAssignments(
  input: ReplaceWarehouseAssignmentsInput
): Promise<void> {
  const values = replaceWarehouseAssignmentsSchema.parse(input);
  const org = await resolveOrganization(values.orgSlug);
  const supabase = await createClient();
  const { error } = await supabase.rpc("replace_warehouse_user_assignments", {
    p_org_id: org.id,
    p_user_id: values.userId,
    p_warehouse_ids: values.warehouseIds,
  });
  if (error) {
    throw new Error(error.message);
  }
}

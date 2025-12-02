import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";
import { getOrganizationBySlug } from "./organizations.service";

type RoleRow = Database["public"]["Tables"]["roles"]["Row"];
type PermissionRow = Database["public"]["Tables"]["permissions"]["Row"];

export type OrganizationRole = RoleRow & {
  memberCount: number;
};

export type Permission = PermissionRow;

export async function getAllPermissions(): Promise<Permission[]> {
  const supabase = await createClient();

  const { data: permissions, error } = await supabase
    .from("permissions")
    .select("id, key, description")
    .order("key", { ascending: true });

  if (error) {
    throw new Error(`Error fetching permissions: ${error.message}`);
  }

  return permissions ?? [];
}

export async function getOrganizationRolesBySlug(
  orgSlug: string
): Promise<OrganizationRole[]> {
  const organization = await getOrganizationBySlug(orgSlug);

  if (!organization) {
    return [];
  }

  const supabase = await createClient();

  // Get roles
  const { data: roles, error: rolesError } = await supabase
    .from("roles")
    .select("id, key, name, description, organization_id")
    .eq("organization_id", organization.id)
    .order("name", { ascending: true });

  if (rolesError) {
    throw new Error(`Error fetching roles: ${rolesError.message}`);
  }

  if (!roles || roles.length === 0) {
    return [];
  }

  // Get member counts per role
  const { data: memberCounts, error: countsError } = await supabase
    .from("organization_members")
    .select("role_id")
    .eq("organization_id", organization.id);

  if (countsError) {
    throw new Error(`Error fetching member counts: ${countsError.message}`);
  }

  // Count members per role
  const countsByRoleId = new Map<string, number>();
  if (memberCounts) {
    for (const member of memberCounts) {
      const currentCount = countsByRoleId.get(member.role_id) || 0;
      countsByRoleId.set(member.role_id, currentCount + 1);
    }
  }

  // Combine roles with member counts
  return roles.map((role) => ({
    ...role,
    memberCount: countsByRoleId.get(role.id) || 0,
  }));
}

export type CreateRoleParams = {
  organizationId: string;
  name: string;
  key: string;
  description?: string | null;
  permissionIds: string[];
};

export async function createRoleWithPermissions(
  params: CreateRoleParams
): Promise<{ id: string }> {
  const supabase = await createClient();

  // Validate inputs
  if (!params.name?.trim()) {
    throw new Error("El nombre del rol es requerido");
  }

  if (!params.key?.trim()) {
    throw new Error("La clave del rol es requerida");
  }

  // Check if role key already exists in organization
  const { data: existingRole, error: checkError } = await supabase
    .from("roles")
    .select("id")
    .eq("organization_id", params.organizationId)
    .eq("key", params.key.trim())
    .maybeSingle();

  if (checkError) {
    throw new Error(`Error verificando rol existente: ${checkError.message}`);
  }

  if (existingRole) {
    throw new Error(
      `Ya existe un rol con la clave "${params.key}" en esta organización`
    );
  }

  // Create the role
  const { data: role, error: roleError } = await supabase
    .from("roles")
    .insert({
      organization_id: params.organizationId,
      name: params.name.trim(),
      key: params.key.trim(),
      description: params.description?.trim() || null,
    })
    .select("id")
    .single();

  if (roleError) {
    throw new Error(`Error creando rol: ${roleError.message}`);
  }

  if (!role) {
    throw new Error("Error: No se pudo crear el rol");
  }

  // If there are permissions to assign, create role_permissions entries
  if (params.permissionIds.length > 0) {
    const rolePermissions = params.permissionIds.map((permissionId) => ({
      role_id: role.id,
      permission_id: permissionId,
    }));

    const { error: permissionsError } = await supabase
      .from("role_permissions")
      .insert(rolePermissions);

    if (permissionsError) {
      // If permissions insertion fails, we should rollback the role creation
      // but for simplicity, we'll just log the error
      // In production, you might want to use a transaction
      throw new Error(`Error asignando permisos: ${permissionsError.message}`);
    }
  }

  return { id: role.id };
}

export async function deleteRole(roleId: string): Promise<void> {
  const supabase = await createClient();

  // First check if role has any members
  const { data: members, error: membersError } = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("role_id", roleId)
    .limit(1);

  if (membersError) {
    throw new Error(`Error verificando miembros: ${membersError.message}`);
  }

  if (members && members.length > 0) {
    throw new Error(
      "No se puede eliminar el rol porque tiene miembros asignados"
    );
  }

  // Delete role_permissions first (cascade should handle this, but being explicit)
  const { error: permissionsError } = await supabase
    .from("role_permissions")
    .delete()
    .eq("role_id", roleId);

  if (permissionsError) {
    throw new Error(`Error eliminando permisos: ${permissionsError.message}`);
  }

  // Delete the role
  const { error: roleError } = await supabase
    .from("roles")
    .delete()
    .eq("id", roleId);

  if (roleError) {
    throw new Error(`Error eliminando rol: ${roleError.message}`);
  }
}

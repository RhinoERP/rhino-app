import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";
import { getOrganizationBySlug } from "./organizations.service";

type RoleRow = Database["public"]["Tables"]["roles"]["Row"];
type PermissionRow = Database["public"]["Tables"]["permissions"]["Row"];

export type OrganizationRole = RoleRow & {
  memberCount: number;
  permissionIds: string[];
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

  const { data: memberCounts, error: countsError } = await supabase
    .from("organization_members")
    .select("role_id")
    .eq("organization_id", organization.id);

  if (countsError) {
    throw new Error(`Error fetching member counts: ${countsError.message}`);
  }

  const countsByRoleId = new Map<string, number>();
  if (memberCounts) {
    for (const member of memberCounts) {
      const currentCount = countsByRoleId.get(member.role_id) || 0;
      countsByRoleId.set(member.role_id, currentCount + 1);
    }
  }

  const roleIds = roles.map((role) => role.id);
  const { data: rolePermissions, error: permissionsError } = await supabase
    .from("role_permissions")
    .select("role_id, permission_id")
    .in("role_id", roleIds);

  if (permissionsError) {
    throw new Error(
      `Error fetching role permissions: ${permissionsError.message}`
    );
  }

  const permissionsByRoleId = new Map<string, string[]>();
  if (rolePermissions) {
    for (const rp of rolePermissions) {
      const existing = permissionsByRoleId.get(rp.role_id) || [];
      existing.push(rp.permission_id);
      permissionsByRoleId.set(rp.role_id, existing);
    }
  }

  return roles.map((role) => ({
    ...role,
    memberCount: countsByRoleId.get(role.id) || 0,
    permissionIds: permissionsByRoleId.get(role.id) || [],
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

  if (params.permissionIds.length > 0) {
    const rolePermissions = params.permissionIds.map((permissionId) => ({
      role_id: role.id,
      permission_id: permissionId,
    }));

    const { error: permissionsError } = await supabase
      .from("role_permissions")
      .insert(rolePermissions);

    if (permissionsError) {
      throw new Error(`Error asignando permisos: ${permissionsError.message}`);
    }
  }

  return { id: role.id };
}

export type UpdateRoleParams = {
  roleId: string;
  name: string;
  key: string;
  description?: string | null;
  permissionIds: string[];
};

export async function updateRoleWithPermissions(
  params: UpdateRoleParams
): Promise<void> {
  const supabase = await createClient();

  const { data: role, error: roleFetchError } = await supabase
    .from("roles")
    .select("organization_id, key")
    .eq("id", params.roleId)
    .single();

  if (roleFetchError) {
    throw new Error(`Error obteniendo rol: ${roleFetchError.message}`);
  }

  if (!role) {
    throw new Error("Rol no encontrado");
  }

  if (params.key.trim() !== role.key) {
    const { data: existingRole, error: checkError } = await supabase
      .from("roles")
      .select("id")
      .eq("organization_id", role.organization_id)
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
  }

  const { error: updateError } = await supabase
    .from("roles")
    .update({
      name: params.name.trim(),
      key: params.key.trim(),
      description: params.description?.trim() || null,
    })
    .eq("id", params.roleId);

  if (updateError) {
    throw new Error(`Error actualizando rol: ${updateError.message}`);
  }

  const { error: deleteError } = await supabase
    .from("role_permissions")
    .delete()
    .eq("role_id", params.roleId);

  if (deleteError) {
    throw new Error(`Error eliminando permisos: ${deleteError.message}`);
  }

  if (params.permissionIds.length > 0) {
    const rolePermissions = params.permissionIds.map((permissionId) => ({
      role_id: params.roleId,
      permission_id: permissionId,
    }));

    const { error: insertError } = await supabase
      .from("role_permissions")
      .insert(rolePermissions);

    if (insertError) {
      throw new Error(`Error asignando permisos: ${insertError.message}`);
    }
  }
}

export async function deleteRole(roleId: string): Promise<void> {
  const supabase = await createClient();

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

  const { error: permissionsError } = await supabase
    .from("role_permissions")
    .delete()
    .eq("role_id", roleId);

  if (permissionsError) {
    throw new Error(`Error eliminando permisos: ${permissionsError.message}`);
  }

  const { error: roleError } = await supabase
    .from("roles")
    .delete()
    .eq("id", roleId);

  if (roleError) {
    throw new Error(`Error eliminando rol: ${roleError.message}`);
  }
}

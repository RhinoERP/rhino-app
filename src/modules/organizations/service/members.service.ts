import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

type OrganizationMemberRow =
  Database["public"]["Tables"]["organization_members"]["Row"];
type RoleRow = Database["public"]["Tables"]["roles"]["Row"];

type MemberWithRole = OrganizationMemberRow & {
  role: Pick<RoleRow, "id" | "key" | "name" | "description"> | null;
};

export type OrganizationMember = MemberWithRole & {
  user: {
    id: string;
    email: string | undefined;
    name: string | undefined;
  } | null;
};

type RpcResult =
  Database["public"]["Functions"]["get_organization_members_with_users"]["Returns"][number];

function mapRole(row: RpcResult): OrganizationMember["role"] {
  if (!row.role_id) {
    return null;
  }

  return {
    id: row.role_id,
    key: row.role_key ?? "",
    name: row.role_name ?? "",
    description: null,
  };
}

function mapUser(row: RpcResult): OrganizationMember["user"] {
  if (!row.user_id) {
    return null;
  }

  return {
    id: row.user_id,
    email: row.email ?? undefined,
    name: row.full_name ?? undefined,
  };
}

export async function getOrganizationMembersBySlug(
  orgSlug: string
): Promise<OrganizationMember[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc(
    "get_organization_members_with_users",
    {
      org_slug_param: orgSlug,
    }
  );

  if (error) {
    throw new Error(`Error fetching members: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return [];
  }

  return data.map((row) => ({
    user_id: row.user_id,
    organization_id: row.organization_id,
    role_id: row.role_id,
    is_owner: row.is_owner,
    created_at: row.member_created_at ?? null,
    role: mapRole(row),
    user: mapUser(row),
  }));
}

export type UpdateMemberRoleParams = {
  userId: string;
  organizationId: string;
  roleId: string | null;
};

export async function updateMemberRole(
  params: UpdateMemberRoleParams
): Promise<void> {
  const supabase = await createClient();

  const { data: member, error: memberError } = await supabase
    .from("organization_members")
    .select("user_id, organization_id, is_owner")
    .eq("user_id", params.userId)
    .eq("organization_id", params.organizationId)
    .maybeSingle();

  if (memberError) {
    throw new Error(`Error verificando miembro: ${memberError.message}`);
  }

  if (!member) {
    throw new Error("Miembro no encontrado");
  }

  if (member.is_owner) {
    throw new Error("No se puede cambiar el rol del dueño de la organización");
  }

  if (params.roleId) {
    const { data: role, error: roleError } = await supabase
      .from("roles")
      .select("id, organization_id")
      .eq("id", params.roleId)
      .maybeSingle();

    if (roleError) {
      throw new Error(`Error verificando rol: ${roleError.message}`);
    }

    if (!role) {
      throw new Error("Rol no encontrado");
    }

    if (role.organization_id !== params.organizationId) {
      throw new Error("El rol no pertenece a esta organización");
    }
  }

  const { error: updateError } = await supabase
    .from("organization_members")
    .update({ role_id: params.roleId ?? undefined })
    .eq("user_id", params.userId)
    .eq("organization_id", params.organizationId);

  if (updateError) {
    throw new Error(
      `Error actualizando rol del miembro: ${updateError.message}`
    );
  }
}

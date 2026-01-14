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

async function mapRpcResultsToMembers(
  rpcData: RpcResult[],
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<OrganizationMember[]> {
  const userIds = rpcData.map((row) => row.user_id);
  const { data: membersData } = await supabase
    .from("organization_members")
    .select("user_id, is_active, disabled_at, disabled_by")
    .in("user_id", userIds);

  const membersMap = new Map(
    membersData?.map((m) => [
      m.user_id,
      {
        is_active: m.is_active ?? true,
        disabled_at: m.disabled_at ?? null,
        disabled_by: m.disabled_by ?? null,
      },
    ]) || []
  );

  return rpcData.map((row) => {
    const memberStatus = membersMap.get(row.user_id);
    return {
      user_id: row.user_id,
      organization_id: row.organization_id,
      role_id: row.role_id,
      is_owner: row.is_owner,
      created_at: row.member_created_at ?? null,
      is_active: memberStatus?.is_active ?? true,
      disabled_at: memberStatus?.disabled_at ?? null,
      disabled_by: memberStatus?.disabled_by ?? null,
      role: mapRole(row),
      user: mapUser(row),
    };
  });
}

async function getCurrentUserMember(
  orgSlug: string,
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<OrganizationMember | null> {
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();

  if (!currentUser) {
    return null;
  }

  const { data: memberData, error: memberError } = await supabase
    .from("organization_members")
    .select("*, roles(id, key, name, description), organizations!inner(slug)")
    .eq("user_id", currentUser.id)
    .eq("organizations.slug", orgSlug)
    .maybeSingle();

  if (memberError || !memberData) {
    return null;
  }

  const roleData = Array.isArray(memberData.roles)
    ? memberData.roles[0]
    : memberData.roles;

  return {
    user_id: memberData.user_id,
    organization_id: memberData.organization_id,
    role_id: memberData.role_id,
    is_owner: memberData.is_owner,
    created_at: memberData.created_at,
    is_active: memberData.is_active ?? true,
    disabled_at: memberData.disabled_at ?? null,
    disabled_by: memberData.disabled_by ?? null,
    role: roleData
      ? {
          id: roleData.id,
          key: roleData.key,
          name: roleData.name,
          description: roleData.description,
        }
      : null,
    user: {
      id: currentUser.id,
      email: currentUser.email,
      name: currentUser.user_metadata?.full_name ?? currentUser.email,
    },
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

  if (!error && data) {
    return mapRpcResultsToMembers(data, supabase);
  }

  if (error) {
    console.warn(
      `Access restricted to full member list (${error.message}). Falling back to current user only.`
    );

    const currentUserMember = await getCurrentUserMember(orgSlug, supabase);
    return currentUserMember ? [currentUserMember] : [];
  }

  return [];
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

export type ToggleMemberStatusParams = {
  userId: string;
  organizationId: string;
  isActive: boolean;
};

export async function toggleMemberStatus(
  params: ToggleMemberStatusParams
): Promise<void> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    throw new Error("No se pudo obtener el usuario actual");
  }

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
    throw new Error("No se puede desactivar al dueño de la organización");
  }

  const updateData: {
    is_active: boolean;
    disabled_at: string | null;
    disabled_by: string | null;
  } = {
    is_active: params.isActive,
    disabled_at: params.isActive ? null : new Date().toISOString(),
    disabled_by: params.isActive ? null : user.id,
  };

  const { error: updateError } = await supabase
    .from("organization_members")
    .update(updateData)
    .eq("user_id", params.userId)
    .eq("organization_id", params.organizationId);

  if (updateError) {
    throw new Error(
      `Error ${params.isActive ? "activando" : "desactivando"} miembro: ${updateError.message}`
    );
  }
}

import { createAdminClient } from "@/lib/supabase/admin-client";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

type OrganizationMemberRow =
  Database["public"]["Tables"]["organization_members"]["Row"];
type RoleRow = Database["public"]["Tables"]["roles"]["Row"];
type OrganizationRow = Database["public"]["Tables"]["organizations"]["Row"];
type MemberRole = Pick<RoleRow, "id" | "key" | "name" | "description">;

type MemberWithRole = OrganizationMemberRow & {
  role: MemberRole | null;
};

export type OrganizationMember = MemberWithRole & {
  user: {
    id: string;
    email: string | undefined;
    name: string | undefined;
  } | null;
  base_commission_rate?: number | null;
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

function mapMemberRow(row: RpcResult): OrganizationMember {
  return {
    user_id: row.user_id,
    organization_id: row.organization_id,
    role_id: row.role_id,
    is_owner: row.is_owner,
    is_active: row.is_active,
    created_at: row.member_created_at ?? null,
    disabled_at: null,
    disabled_by: null,
    base_commission_rate:
      ((row as Record<string, unknown>).base_commission_rate as
        | number
        | null) ?? null,
    role: mapRole(row),
    user: mapUser(row),
  };
}

function mapAdminMemberRow(params: {
  member: OrganizationMemberRow;
  role: MemberRole | null;
  user: {
    id: string;
    email: string | undefined;
    name: string | undefined;
  } | null;
}): OrganizationMember {
  const { member, role, user } = params;

  return {
    user_id: member.user_id,
    organization_id: member.organization_id,
    role_id: member.role_id,
    is_owner: member.is_owner,
    is_active: member.is_active,
    created_at: member.created_at,
    disabled_at: member.disabled_at,
    disabled_by: member.disabled_by,
    base_commission_rate:
      ((member as Record<string, unknown>).base_commission_rate as
        | number
        | null
        | undefined) ?? null,
    role: role
      ? {
          id: role.id,
          key: role.key,
          name: role.name,
          description: role.description,
        }
      : null,
    user,
  };
}

export async function getOrganizationMembersWithUsersAdmin(
  orgSlug: string
): Promise<OrganizationMember[]> {
  const supabaseAdmin = createAdminClient();

  const { data: organization, error: organizationError } = await supabaseAdmin
    .from("organizations")
    .select("id")
    .eq("slug", orgSlug)
    .maybeSingle();

  if (organizationError || !organization) {
    console.warn(
      `No se pudo resolver la organización para listar miembros: ${organizationError?.message ?? "sin datos"}`
    );
    return [];
  }

  const organizationRow = organization as Pick<OrganizationRow, "id">;
  const { data: members, error: membersError } = await supabaseAdmin
    .from("organization_members")
    .select(
      "user_id, organization_id, role_id, is_owner, is_active, created_at, disabled_at, disabled_by, base_commission_rate"
    )
    .eq("organization_id", organizationRow.id)
    .order("created_at", { ascending: true });

  if (membersError) {
    console.warn(
      `No se pudieron obtener miembros de la organización: ${membersError.message}`
    );
    return [];
  }

  const memberRows = (members ?? []) as OrganizationMemberRow[];
  if (memberRows.length === 0) {
    return [];
  }

  const roleIds = Array.from(
    new Set(memberRows.map((member) => member.role_id))
  );
  const userIds = Array.from(
    new Set(memberRows.map((member) => member.user_id))
  );

  const rolesPromise = roleIds.length
    ? supabaseAdmin
        .from("roles")
        .select("id, key, name, description")
        .in("id", roleIds)
    : Promise.resolve({ data: [] as MemberRole[], error: null });

  const usersPromise = Promise.all(
    userIds.map(async (userId) => {
      const { data, error } =
        await supabaseAdmin.auth.admin.getUserById(userId);

      if (error) {
        console.warn(
          `No se pudo obtener el usuario ${userId}: ${error.message}`
        );
        return [userId, null] as const;
      }

      const authUser = data.user;
      if (!authUser) {
        return [userId, null] as const;
      }

      return [
        userId,
        {
          id: authUser.id,
          email: authUser.email ?? undefined,
          name:
            (authUser.user_metadata?.full_name as string | undefined) ??
            authUser.email ??
            undefined,
        },
      ] as const;
    })
  );

  const [{ data: roles, error: rolesError }, users] = await Promise.all([
    rolesPromise,
    usersPromise,
  ]);

  if (rolesError) {
    console.warn(
      `No se pudieron obtener roles para los miembros: ${rolesError.message}`
    );
  }

  const rolesById = new Map((roles ?? []).map((role) => [role.id, role]));
  const usersById = new Map(users);

  return memberRows.map((member) =>
    mapAdminMemberRow({
      member,
      role: rolesById.get(member.role_id) ?? null,
      user: usersById.get(member.user_id) ?? null,
    })
  );
}

export type UpdateMemberRoleParams = {
  userId: string;
  organizationId: string;
  roleId: string | null;
};

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
    return data.map(mapMemberRow);
  }

  console.warn(
    `Access restricted to full member list (${error.message}). Falling back to current user only.`
  );

  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();

  if (!currentUser) {
    return [];
  }

  const { data: memberData, error: memberError } = await supabase
    .from("organization_members")
    .select("*, roles(id, key, name, description), organizations!inner(slug)")
    .eq("user_id", currentUser.id)
    .eq("organizations.slug", orgSlug)
    .maybeSingle();

  if (memberError || !memberData) {
    // If even fetching self fails, return empty list (safe default)
    return [];
  }

  const roleData = Array.isArray(memberData.roles)
    ? memberData.roles[0]
    : memberData.roles;

  const myself: OrganizationMember = {
    user_id: memberData.user_id,
    organization_id: memberData.organization_id,
    role_id: memberData.role_id,
    is_owner: memberData.is_owner,
    is_active: memberData.is_active,
    disabled_at: memberData.disabled_at,
    disabled_by: memberData.disabled_by,
    created_at: memberData.created_at,
    base_commission_rate:
      ((memberData as Record<string, unknown>).base_commission_rate as
        | number
        | undefined) ?? 0,
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

  return [myself];
}

export async function getOrganizationSalesMembersBySlug(
  orgSlug: string
): Promise<OrganizationMember[]> {
  const supabase = await createClient();

  const { data: permissions, error: permissionsError } = await supabase.rpc(
    "get_user_org_permissions_by_slug",
    {
      target_org_slug: orgSlug,
    }
  );

  if (permissionsError) {
    console.warn(
      `No se pudieron obtener permisos de ventas para ampliar vendedores: ${permissionsError.message}`
    );
  }

  const userPermissions = permissionsError
    ? []
    : ((permissions ?? []) as string[]);
  const canSelectAnySeller =
    userPermissions.includes("organization.admin") ||
    userPermissions.includes("sales.manage.all");

  if (canSelectAnySeller) {
    try {
      const members = await getOrganizationMembersWithUsersAdmin(orgSlug);

      if (members.length > 0) {
        return members;
      }
    } catch (error) {
      console.warn("No se pudo inicializar la carga ampliada de vendedores", {
        error,
      });
    }
  }

  return getOrganizationMembersBySlug(orgSlug);
}

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

export type UpdateMemberCommissionParams = {
  userId: string;
  organizationId: string;
  baseCommissionRate: number;
};

export async function updateMemberCommission(
  params: UpdateMemberCommissionParams
): Promise<void> {
  const supabase = await createClient();

  if (params.baseCommissionRate < 0 || params.baseCommissionRate > 100) {
    throw new Error("La comisión base debe estar entre 0 y 100");
  }

  const { error: updateError } = (await supabase
    .from("organization_members")
    .update({ base_commission_rate: params.baseCommissionRate } as Record<
      string,
      unknown
    >)
    .eq("user_id", params.userId)
    .eq("organization_id", params.organizationId)) as {
    error: { message: string } | null;
  };

  if (updateError) {
    throw new Error(`Error actualizando comisión base: ${updateError.message}`);
  }
}
/**
 * Fetches all members of an organization by slug (admin view - no RLS restrictions)
 * This is used in the admin dashboard to see all users in an organization
 */
export function getOrganizationMembersAdminView(
  orgSlug: string
): Promise<OrganizationMember[]> {
  return getOrganizationMembersWithUsersAdmin(orgSlug);
}

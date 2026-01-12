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

  // 1. Try to fetch ALL members using the RPC (Happy path for Admins)
  const { data, error } = await supabase.rpc(
    "get_organization_members_with_users",
    {
      org_slug_param: orgSlug,
    }
  );

  // 2. HAPPY PATH: If no error, return the full list
  if (!error && data) {
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

  // 3. FALLBACK PATH: If RPC failed (likely 403 Permissions/RLS), fetch ONLY the current user
  // This satisfies: "if the current user is not allowed... only be allowed to view itself"
  if (error) {
    console.warn(
      `Access restricted to full member list (${error.message}). Falling back to current user only.`
    );

    // Get the current authenticated user
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();

    if (!currentUser) {
      return [];
    }

    // Fetch ONLY the member record for this specific user in this org
    // We join the 'roles' table to get the role details needed for the UI
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

    // Construct the Member object manually using the current user's session data
    // (Since we can't join 'auth.users' directly in a client query)
    const roleData = Array.isArray(memberData.roles)
      ? memberData.roles[0]
      : memberData.roles;

    const myself: OrganizationMember = {
      user_id: memberData.user_id,
      organization_id: memberData.organization_id,
      role_id: memberData.role_id,
      is_owner: memberData.is_owner,
      created_at: memberData.created_at,
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
        // Use metadata name or fallback to email
        name: currentUser.user_metadata?.full_name ?? currentUser.email,
      },
    };

    return [myself];
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

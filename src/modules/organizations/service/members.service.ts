import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

type OrganizationMemberRow =
  Database["public"]["Tables"]["organization_members"]["Row"];
type RoleRow = Database["public"]["Tables"]["roles"]["Row"];

type MemberWithRole = OrganizationMemberRow & {
  role: Pick<RoleRow, "id" | "key" | "name" | "description"> | null;
};

type OrganizationMember = MemberWithRole & {
  user: {
    id: string;
    email: string | undefined;
    name: string | undefined;
  } | null;
};

type RpcResult =
  Database["public"]["Functions"]["get_organization_members_with_accounts"]["Returns"][number];

type RpcResultWithEmail = RpcResult & { account_email?: string | null };

function mapRole(row: RpcResult): OrganizationMember["role"] {
  if (!row.role_id_fk) {
    return null;
  }

  return {
    id: row.role_id_fk,
    key: row.role_key ?? "",
    name: row.role_name ?? "",
    description: row.role_description ?? null,
  };
}

function mapUser(row: RpcResultWithEmail): OrganizationMember["user"] {
  if (!row.account_id) {
    return null;
  }

  return {
    id: row.account_id,
    email: row.account_email ?? undefined,
    name: row.account_full_name ?? undefined,
  };
}

export async function getOrganizationMembersBySlug(
  orgSlug: string
): Promise<OrganizationMember[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc(
    "get_organization_members_with_accounts",
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

  return (data as RpcResultWithEmail[]).map((row) => ({
    user_id: row.user_id,
    organization_id: row.organization_id,
    role_id: row.role_id,
    is_owner: row.is_owner,
    created_at: row.created_at,
    role: mapRole(row),
    user: mapUser(row),
  }));
}

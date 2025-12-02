import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";
import { getOrganizationBySlug } from "./organizations.service";

type RoleRow = Database["public"]["Tables"]["roles"]["Row"];

export type OrganizationRole = RoleRow & {
  memberCount: number;
};

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

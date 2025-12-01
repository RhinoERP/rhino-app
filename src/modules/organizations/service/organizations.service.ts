import { isSuperAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type Organization = {
  id: string;
  name: string;
  cuit: string | null;
  created_at: string | null;
  slug?: string | null;
};

type MembershipWithOrg = {
  organization: Organization | null;
};

/**
 * Gets all organizations in the platform
 * Only accessible by superadmins
 */
export async function getAllOrganizations(): Promise<Organization[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, cuit, created_at, slug")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Error fetching organizations: ${error.message}`);
  }

  return (data as unknown as Organization[]) ?? [];
}

/**
 * Gets the total count of organizations
 */
export async function getOrganizationsCount(): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("organizations")
    .select("*", { count: "exact", head: true });

  if (error) {
    throw new Error(`Error counting organizations: ${error.message}`);
  }

  return count || 0;
}

/**
 * Gets organization by slug
 */
export async function getOrganizationBySlug(
  slug: string
): Promise<Organization | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, cuit, created_at, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new Error(`Error fetching organization: ${error.message}`);
  }

  return (data as unknown as Organization) ?? null;
}

/**
 * Gets all organizations that the current user is a member of
 */
export async function getUserOrganizations(): Promise<Organization[]> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  const { data: memberships, error } = await supabase
    .from("organization_members")
    .select("organization:organizations(id, name, cuit, created_at, slug)")
    .eq("user_id", user.id);

  if (error) {
    throw new Error(`Error fetching user organizations: ${error.message}`);
  }

  if (!memberships) {
    return [];
  }

  return memberships
    .map((m) => (m as unknown as MembershipWithOrg).organization)
    .filter((org): org is Organization => org !== null);
}

/**
 * Resolves where a logged-in user should be redirected:
 * - superadmin -> /admin
 * - 1 org membership -> /org/[slug]
 * - 0 orgs -> /no-org
 * - many orgs -> /select-org
 * - no user -> /auth/login (or public landing page)
 */
export async function resolveUserRedirect(): Promise<string> {
  const supabase = await createClient();

  // 1. Get current authenticated user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return "/auth/login";
  }

  // 2. Check if user is a platform superadmin via platform_admins table
  const isAdmin = await isSuperAdmin();
  if (isAdmin) {
    return "/admin";
  }

  // 3. Get user's organization memberships
  const { data: memberships, error: membershipsError } = await supabase
    .from("organization_members")
    .select("organization:organizations(slug)")
    .eq("user_id", user.id);

  if (membershipsError) {
    return "/auth/login";
  }

  if (!memberships || memberships.length === 0) {
    return "/no-org";
  }

  // Filter memberships that have an organization with a valid slug
  const validOrgs = memberships
    .map((m) => {
      const org = (m as unknown as MembershipWithOrg).organization;
      return org?.slug ? org.slug : null;
    })
    .filter((slug): slug is string => slug !== null);

  if (validOrgs.length === 1) {
    return `/org/${validOrgs[0]}`;
  }

  return "/select-org";
}

/**
 * Helper function to check membership for a given organization ID
 */
async function checkMembership(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  organizationId: string
): Promise<boolean> {
  // organization_members has composite primary key (user_id, organization_id), no id column
  const { data: membership, error: membershipError } = await supabase
    .from("organization_members")
    .select("user_id, organization_id")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (membershipError) {
    return false;
  }

  if (!membership) {
    return false;
  }

  return true;
}

/**
 * Checks whether the authenticated user is a member of the organization (by slug).
 * Returns true/false to be used in route guards.
 */
export async function isUserMemberOfOrganization(
  orgSlug: string
): Promise<boolean> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return false;
  }

  // First fetch the organization by slug
  // Try to select slug if it exists in the database
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id, slug")
    .eq("slug", orgSlug)
    .maybeSingle();

  // If error is about slug column not existing, try without it
  if (
    orgError?.message?.includes("column") &&
    orgError?.message?.includes("slug")
  ) {
    const { data: orgRetry, error: orgRetryError } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", orgSlug)
      .maybeSingle();

    if (orgRetryError || !orgRetry) {
      return false;
    }

    return checkMembership(supabase, user.id, orgRetry.id);
  }

  if (orgError || !org) {
    return false;
  }

  return checkMembership(supabase, user.id, org.id);
}

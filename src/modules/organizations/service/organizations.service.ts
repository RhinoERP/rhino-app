import { isSuperAdmin } from "@/lib/supabase/admin";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { createClient } from "@/lib/supabase/server";
import type { Organization } from "../types";
import { isOrganizationModuleEnabled } from "../utils/module-flags";

type MembershipWithOrg = {
  organization: Organization | null;
};

export type OrganizationLayoutData = {
  user: {
    email?: string;
    user_metadata?: {
      full_name?: string;
      [key: string]: unknown;
    };
    picture?: string;
    [key: string]: unknown;
  } | null;
  organizations: Organization[];
  currentOrganization: Organization;
  permissions: string[];
};

/**
 * Gets all organizations in the platform
 * Only accessible by superadmins
 */
export async function getAllOrganizations(): Promise<Organization[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("organizations")
    .select(
      "id, name, cuit, created_at, slug, is_active, wholesale_enabled, pos_enabled"
    )
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
 * Gets the total count of unique users across all organizations
 * Only accessible by superadmins
 */
export async function getTotalUniqueUsers(): Promise<number> {
  try {
    const supabase = createAdminClient();

    const { data: allMembers, error } = await supabase
      .from("organization_members")
      .select("user_id");

    if (error) {
      console.error("Error fetching unique users count:", error);
      return 0;
    }

    if (!allMembers || allMembers.length === 0) {
      return 0;
    }

    // Get unique user_ids
    const uniqueUserIds = new Set(allMembers.map((m) => m.user_id));
    return uniqueUserIds.size;
  } catch (error) {
    console.error("Exception in getTotalUniqueUsers:", error);
    return 0;
  }
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
    .select(
      "id, name, cuit, created_at, slug, is_active, wholesale_enabled, pos_enabled"
    )
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
    .select(
      "organization:organizations(id, name, cuit, created_at, slug, is_active, wholesale_enabled, pos_enabled)"
    )
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
 * - 1+ org memberships -> /org/[first-slug]/[first-accessible-page]
 * - 0 orgs -> /no-org
 * - no user -> /auth/login (or public landing page)
 */
export async function resolveUserRedirect(): Promise<string> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return "/auth/login";
  }

  const isAdmin = await isSuperAdmin();
  if (isAdmin) {
    return "/admin";
  }

  const { data: memberships, error: membershipsError } = await supabase
    .from("organization_members")
    .select(
      "organization:organizations(slug, is_active, wholesale_enabled, pos_enabled)"
    )
    .eq("user_id", user.id)
    .eq("is_active", true);

  if (membershipsError) {
    return "/auth/login";
  }

  if (!memberships || memberships.length === 0) {
    return "/no-org";
  }

  const validOrgs = memberships
    .map((m) => {
      const org = (m as unknown as MembershipWithOrg).organization;
      return org?.slug && org.is_active === true ? org : null;
    })
    .filter((org): org is Organization => org !== null);

  if (validOrgs.length === 0) {
    return "/no-org";
  }

  const firstOrg = validOrgs[0];
  const firstOrgSlug = firstOrg.slug;

  if (!firstOrgSlug) {
    return "/no-org";
  }

  const { data: permissions } = await supabase.rpc(
    "get_user_org_permissions_by_slug",
    {
      target_org_slug: firstOrgSlug,
    }
  );

  const userPermissions = (permissions ?? []) as string[];

  const routes = [
    { path: "", permission: "dashboard.read" },
    { path: "/ventas", permission: "sales.read", module: "wholesale" as const },
    { path: "/venta-directa", permission: "pos.read", module: "pos" as const },
    {
      path: "/cobranzas",
      permission: "collections.read",
      module: "wholesale" as const,
    },
    { path: "/clientes", permission: "customers.read" },
    { path: "/compras", permission: "purchases.read" },
    { path: "/proveedores", permission: "suppliers.read" },
    { path: "/stock", permission: "inventory.read" },
    { path: "/precios/listas-de-precios", permission: "pricelists.read" },
  ];

  for (const route of routes) {
    if (
      userPermissions.includes(route.permission) &&
      (!route.module || isOrganizationModuleEnabled(firstOrg, route.module))
    ) {
      return `/org/${firstOrgSlug}${route.path}`;
    }
  }

  return `/org/${firstOrgSlug}`;
}

/**
 * Fetches user data, organizations, and verifies membership in parallel.
 */
export async function getOrganizationLayoutData(
  orgSlug: string
): Promise<OrganizationLayoutData | null> {
  const supabase = await createClient();

  const { data: authData } = await supabase.auth.getClaims();
  const userId = authData?.claims?.sub;
  const userClaims = authData?.claims;

  if (!userId) {
    return null;
  }

  const [organizationsResult, permissionsResult] = await Promise.all([
    supabase
      .from("organization_members")
      .select(
        "organization:organizations(id, name, cuit, created_at, slug, is_active, wholesale_enabled, pos_enabled)"
      )
      .eq("user_id", userId)
      .eq("is_active", true),
    supabase.rpc("get_user_org_permissions_by_slug", {
      target_org_slug: orgSlug,
    }),
  ]);

  if (organizationsResult.error) {
    console.error("Error fetching organizations", organizationsResult.error);
    return null;
  }

  const memberships =
    (organizationsResult.data as unknown as MembershipWithOrg[]) ?? [];
  const organizations = memberships
    .map((m) => m.organization)
    .filter(
      (org): org is Organization => org !== null && org.is_active === true
    );

  const requestedOrg = organizations.find((org) => org.slug === orgSlug);
  if (!requestedOrg) {
    return null;
  }

  const permissions = permissionsResult.error
    ? []
    : ((permissionsResult.data ?? []) as string[]);

  return {
    user: userClaims as OrganizationLayoutData["user"],
    organizations,
    currentOrganization: requestedOrg,
    permissions,
  };
}

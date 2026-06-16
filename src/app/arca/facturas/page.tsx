import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveUserRedirect } from "@/modules/organizations/service/organizations.service";
import type { Organization } from "@/modules/organizations/types";

type MembershipWithOrg = {
  organization: Pick<Organization, "slug" | "is_active"> | null;
};

type AccessibleOrganization = {
  slug: string;
};

async function resolveArcaInvoicesRedirect(): Promise<string> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const userId = authData?.claims?.sub;

  if (!userId) {
    return "/auth/login";
  }

  const { data: memberships, error } = await supabase
    .from("organization_members")
    .select("organization:organizations(slug, is_active)")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (error || !memberships?.length) {
    return resolveUserRedirect();
  }

  const validOrgs = memberships
    .map((membership) => {
      const org = (membership as unknown as MembershipWithOrg).organization;
      return org?.slug && org.is_active === true ? { slug: org.slug } : null;
    })
    .filter((org): org is AccessibleOrganization => org !== null);

  for (const org of validOrgs) {
    const { data: permissions } = await supabase.rpc(
      "get_user_org_permissions_by_slug",
      {
        target_org_slug: org.slug,
      }
    );

    if (((permissions ?? []) as string[]).includes("arca.read")) {
      return `/org/${org.slug}/arca/facturas`;
    }
  }

  return resolveUserRedirect();
}

export default async function ArcaInvoicesAliasPage() {
  redirect(await resolveArcaInvoicesRedirect());
}

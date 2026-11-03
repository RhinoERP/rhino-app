import { MySalesQuoteRequestsList } from "@/components/sales-quote-requests/my-sales-quote-requests-list";
import { requireAuth } from "@/lib/supabase/auth";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { isOrganizationModuleEnabled } from "@/modules/organizations/utils/module-flags";
import { getMySalesQuoteRequestsByOrgSlug } from "@/modules/sales-quote-requests/service/my-sales-quote-requests.service";

type MySalesQuoteRequestsPageProps = {
  params: Promise<{ orgSlug: string }>;
};

export default async function MySalesQuoteRequestsPage({
  params,
}: MySalesQuoteRequestsPageProps) {
  const { orgSlug } = await params;
  await guardOrganizationPermissionAccess(orgSlug, [
    "sales.manage",
    "sales.manage.all",
  ]);
  const auth = await requireAuth();
  if (!auth) {
    throw new Error("No autorizado");
  }
  const organization = await getOrganizationBySlug(orgSlug);
  const requests = await getMySalesQuoteRequestsByOrgSlug(orgSlug, auth.userId);

  return (
    <MySalesQuoteRequestsList
      orgSlug={orgSlug}
      requests={requests}
      showHistory={isOrganizationModuleEnabled(organization, "production")}
    />
  );
}

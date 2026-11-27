import { MySalesQuoteRequestsList } from "@/components/sales-quote-requests/my-sales-quote-requests-list";
import { requireAuth } from "@/lib/supabase/auth";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";
import { listClientQuoteDrafts } from "@/modules/sales-quote-requests/service/client-quote-drafts.service";
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
  const [requests, drafts] = await Promise.all([
    getMySalesQuoteRequestsByOrgSlug(orgSlug, auth.userId),
    listClientQuoteDrafts(orgSlug, auth.userId),
  ]);

  return (
    <MySalesQuoteRequestsList
      drafts={drafts}
      orgSlug={orgSlug}
      requests={requests}
    />
  );
}

import { SalesQuoteRequestReviewQueue } from "@/components/sales-quote-requests/sales-quote-request-review-queue";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";
import { getPendingSalesQuoteRequestsByOrgSlug } from "@/modules/sales-quote-requests/service/review-sales-quote-requests.service";

type SalesQuoteRequestsApprovalPageProps = {
  params: Promise<{ orgSlug: string }>;
};

export default async function SalesQuoteRequestsApprovalPage({
  params,
}: SalesQuoteRequestsApprovalPageProps) {
  const { orgSlug } = await params;
  await guardOrganizationPermissionAccess(orgSlug, "organization.admin");
  const requests = await getPendingSalesQuoteRequestsByOrgSlug(orgSlug);

  return (
    <div className="min-w-0 space-y-6">
      <div className="min-w-0">
        <h1 className="font-heading text-2xl">Aprobación de cotizaciones</h1>
        <p className="text-muted-foreground text-sm">
          Revisá los precios sugeridos y aprobá las solicitudes o devolvelas al
          vendedor para corregirlas.
        </p>
      </div>
      <SalesQuoteRequestReviewQueue orgSlug={orgSlug} requests={requests} />
    </div>
  );
}

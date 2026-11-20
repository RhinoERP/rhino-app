import { notFound } from "next/navigation";
import { VisitReview } from "@/components/commercial-visits/visit-review";
import { getSalesAccessContext } from "@/modules/sales/service/sales.service";

export default async function VisitReviewPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const access = await getSalesAccessContext(orgSlug);
  if (!access.isOrganizationAdmin) {
    notFound();
  }
  return <VisitReview orgSlug={orgSlug} />;
}

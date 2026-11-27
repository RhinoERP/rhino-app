import Link from "next/link";
import { notFound } from "next/navigation";
import { VisitDay } from "@/components/commercial-visits/visit-day";
import { getSalesAccessContext } from "@/modules/sales/service/sales.service";

export default async function CommercialVisitsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const access = await getSalesAccessContext(orgSlug);
  if (!access.canManage) {
    notFound();
  }
  return (
    <>
      {access.isOrganizationAdmin && (
        <div className="mx-auto max-w-2xl px-4 pt-4">
          <Link
            className="text-primary text-sm underline"
            href={`/org/${orgSlug}/visitas/revision`}
          >
            Revisar visitas y puntos de clientes
          </Link>
        </div>
      )}
      <VisitDay orgSlug={orgSlug} />
    </>
  );
}

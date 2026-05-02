import { redirect } from "next/navigation";
import { CollectionsMetrics } from "@/components/collections/collections-metrics";
import { CollectionsTabs } from "@/components/collections/collections-tabs";
import {
  getCollectionsData,
  getCreditOnlyCustomers,
} from "@/modules/collections/service/collections.service";
import { getOrganizationLayoutData } from "@/modules/organizations/service/organizations.service";

type CollectionsPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function CollectionsPage({
  params,
}: CollectionsPageProps) {
  const { orgSlug } = await params;
  const [collectionsData, layoutData] = await Promise.all([
    getCollectionsData(orgSlug),
    getOrganizationLayoutData(orgSlug),
  ]);

  if (!layoutData) {
    redirect("/auth/login");
  }

  const { receivables, payables } = collectionsData;
  const wholesaleEnabled =
    layoutData.currentOrganization.wholesale_enabled ?? true;

  const receivableCustomerIds = new Set(
    receivables.map((r) => r.customer.id).filter(Boolean)
  );
  const creditOnlyCustomers = await getCreditOnlyCustomers(
    orgSlug,
    receivableCustomerIds
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl">Cobranzas</h1>
          <p className="text-muted-foreground text-sm">
            Gestiona cuentas por cobrar y por pagar con pagos parciales.
          </p>
        </div>
      </div>

      <CollectionsMetrics
        payables={payables}
        receivables={receivables}
        wholesaleEnabled={wholesaleEnabled}
      />
      <CollectionsTabs
        creditOnlyCustomers={creditOnlyCustomers}
        orgSlug={orgSlug}
        payables={payables}
        receivables={receivables}
        wholesaleEnabled={wholesaleEnabled}
      />
    </div>
  );
}

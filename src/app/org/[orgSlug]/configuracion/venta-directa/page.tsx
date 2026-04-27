import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { DirectSaleConfigForm } from "@/components/configuration/direct-sale-config-form";
import { DirectSaleSpecificPricesCard } from "@/components/configuration/direct-sale-specific-prices-card";
import { getQueryClient } from "@/lib/get-query-client";
import { getDirectSaleTemplateProductsByOrgSlug } from "@/modules/inventory/service/inventory.service";
import { getDirectSaleConfigByOrgSlug } from "@/modules/organizations/service/organizations.service";
import { taxesServerQueryOptions } from "@/modules/taxes/queries/queries.server";

type DirectSaleConfigPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function DirectSaleConfigPage({
  params,
}: DirectSaleConfigPageProps) {
  const { orgSlug } = await params;
  const queryClient = getQueryClient();

  const [config, templateProducts] = await Promise.all([
    getDirectSaleConfigByOrgSlug(orgSlug),
    getDirectSaleTemplateProductsByOrgSlug(orgSlug),
    queryClient.prefetchQuery(taxesServerQueryOptions(orgSlug)),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Venta directa</h1>
        <p className="text-muted-foreground text-sm">
          Configura los valores predeterminados para operaciones de caja y
          consumidor final.
        </p>
      </div>

      <HydrationBoundary state={dehydrate(queryClient)}>
        <div className="space-y-6">
          <DirectSaleConfigForm initialConfig={config} orgSlug={orgSlug} />
          <DirectSaleSpecificPricesCard
            orgSlug={orgSlug}
            products={templateProducts}
          />
        </div>
      </HydrationBoundary>
    </div>
  );
}

import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { PriceLevelsTable } from "@/components/price-levels/price-levels-table";
import { CreateSalesPriceListDialog } from "@/components/sales-price-lists/create-sales-price-list-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getQueryClient } from "@/lib/get-query-client";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { isOrganizationModuleEnabled } from "@/modules/organizations/utils/module-flags";
import { getPriceLevelsByOrgSlug } from "@/modules/price-levels/service/price-levels.service";
import { salesPriceListsServerQueryOptions } from "@/modules/sales-price-lists/queries/queries.server";
import { SalesPriceListsDataTable } from "./data-table";

type SalesPriceListsPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function SalesPriceListsPage({
  params,
}: SalesPriceListsPageProps) {
  const { orgSlug } = await params;
  const queryClient = getQueryClient();

  const [org, priceLevels] = await Promise.all([
    getOrganizationBySlug(orgSlug),
    getPriceLevelsByOrgSlug(orgSlug),
    queryClient.prefetchQuery(salesPriceListsServerQueryOptions(orgSlug)),
  ]);

  const commissionsEnabled = isOrganizationModuleEnabled(org, "commissions");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl">Listas de precios de venta</h1>
          <p className="text-muted-foreground text-sm">
            Los niveles de margen definen el precio de venta; las listas
            especiales aplican ajustes (descuentos, recargos).
          </p>
        </div>
      </div>

      <Tabs defaultValue="niveles">
        <TabsList>
          <TabsTrigger value="niveles">Niveles de margen</TabsTrigger>
          <TabsTrigger value="listas">Listas especiales</TabsTrigger>
        </TabsList>

        <TabsContent className="mt-4" value="niveles">
          <PriceLevelsTable
            commissionsEnabled={commissionsEnabled}
            orgSlug={orgSlug}
            priceLevels={priceLevels}
          />
        </TabsContent>

        <TabsContent className="mt-4" value="listas">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-muted-foreground text-sm">
              Ajustes por porcentaje o precio fijo sobre el precio efectivo.
            </p>
            <CreateSalesPriceListDialog orgSlug={orgSlug} />
          </div>
          <HydrationBoundary state={dehydrate(queryClient)}>
            <SalesPriceListsDataTable orgSlug={orgSlug} />
          </HydrationBoundary>
        </TabsContent>
      </Tabs>
    </div>
  );
}

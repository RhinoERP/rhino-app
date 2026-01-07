import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { CreateSalesPriceListDialog } from "@/components/sales-price-lists/create-sales-price-list-dialog";
import { getQueryClient } from "@/lib/get-query-client";
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

  await queryClient.prefetchQuery(salesPriceListsServerQueryOptions(orgSlug));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl">Listas de precios de venta</h1>
          <p className="text-muted-foreground text-sm">
            Gestiona las listas de precios que se aplican a los clientes. El
            porcentaje se aplica a todos los productos.
          </p>
        </div>
        <CreateSalesPriceListDialog orgSlug={orgSlug} />
      </div>
      <HydrationBoundary state={dehydrate(queryClient)}>
        <SalesPriceListsDataTable orgSlug={orgSlug} />
      </HydrationBoundary>
    </div>
  );
}

import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { ImportPriceListDialog } from "@/components/price-lists/import-price-list-dialog";
import { getQueryClient } from "@/lib/get-query-client";
import { priceListsServerQueryOptions } from "@/modules/price-lists/queries/queries.server";
import { PriceListsDataTable } from "./data-table";

type PriceListsPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function PriceListsPage({ params }: PriceListsPageProps) {
  const { orgSlug } = await params;
  const queryClient = getQueryClient();

  await queryClient.prefetchQuery(priceListsServerQueryOptions(orgSlug));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl">Listas de precios</h1>
          <p className="text-muted-foreground text-sm">
            Consulta y gestiona las listas de precios de tus proveedores.
          </p>
        </div>
        <ImportPriceListDialog orgSlug={orgSlug} />
      </div>
      <HydrationBoundary state={dehydrate(queryClient)}>
        <PriceListsDataTable orgSlug={orgSlug} />
      </HydrationBoundary>
    </div>
  );
}

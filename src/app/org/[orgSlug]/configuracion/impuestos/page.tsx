import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { AddTaxDialog } from "@/components/taxes/add-tax-dialog";
import { getQueryClient } from "@/lib/get-query-client";
import { taxesServerQueryOptions } from "@/modules/taxes/queries/queries.server";
import { TaxesDataTable } from "./data-table";

type TaxesPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function TaxesPage({ params }: TaxesPageProps) {
  const { orgSlug } = await params;
  const queryClient = getQueryClient();

  await queryClient.prefetchQuery(taxesServerQueryOptions(orgSlug));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl">Impuestos</h1>
          <p className="text-muted-foreground text-sm">
            Gestiona los impuestos disponibles para esta organización.
          </p>
        </div>
        <AddTaxDialog orgSlug={orgSlug} />
      </div>

      <HydrationBoundary state={dehydrate(queryClient)}>
        <TaxesDataTable orgSlug={orgSlug} />
      </HydrationBoundary>
    </div>
  );
}

import { PlusIcon } from "@phosphor-icons/react/dist/ssr";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import Link from "next/link";
import { Suspense } from "react";
import { SalesMetrics } from "@/components/sales/sales-metrics";
import { SalesTabs } from "@/components/sales/sales-tabs";
import { Button } from "@/components/ui/button";
import { getQueryClient } from "@/lib/get-query-client";
import { salesQueryKey } from "@/modules/sales/queries/query-keys";
import { getSalesOrdersByOrgSlug } from "@/modules/sales/service/sales.service";

type SalesPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function SalesPage({ params }: SalesPageProps) {
  const { orgSlug } = await params;
  const queryClient = getQueryClient();

  const sales = await getSalesOrdersByOrgSlug(orgSlug);

  await queryClient.prefetchQuery({
    queryKey: salesQueryKey(orgSlug),
    queryFn: async () => sales,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl">Ventas</h1>
          <p className="text-muted-foreground text-sm">
            Consulta todas las ventas de la organización.
          </p>
        </div>
        <Button asChild>
          <Link href={`/org/${orgSlug}/preventa/nueva`}>
            <PlusIcon className="mr-2 h-4 w-4" weight="bold" />
            Nueva preventa
          </Link>
        </Button>
      </div>

      <SalesMetrics sales={sales} />

      <HydrationBoundary state={dehydrate(queryClient)}>
        <Suspense fallback={<div>Cargando...</div>}>
          <SalesTabs orgSlug={orgSlug} sales={sales} />
        </Suspense>
      </HydrationBoundary>
    </div>
  );
}

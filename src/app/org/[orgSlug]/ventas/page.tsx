import { PlusIcon } from "@phosphor-icons/react/dist/ssr";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SalesMetrics } from "@/components/sales/shared/sales-metrics";
import { SalesTabs } from "@/components/sales/shared/sales-tabs";
import { Button } from "@/components/ui/button";
import { getQueryClient } from "@/lib/get-query-client";
import { salesQueryKey } from "@/modules/sales/queries/query-keys";
import {
  getSalesAccessContext,
  getSalesOrdersByOrgSlug,
} from "@/modules/sales/service/sales.service";

type SalesPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function SalesPage({ params }: SalesPageProps) {
  const { orgSlug } = await params;
  const queryClient = getQueryClient();
  const accessContext = await getSalesAccessContext(orgSlug);

  if (!accessContext.canRead) {
    notFound();
  }

  const sales = await getSalesOrdersByOrgSlug(orgSlug);

  await queryClient.prefetchQuery({
    queryKey: salesQueryKey(orgSlug),
    queryFn: async () => sales,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-heading text-2xl">Ventas</h1>
          <p className="text-muted-foreground text-sm">
            {accessContext.canViewAll
              ? "Consulta todas las ventas de la organización."
              : "Consulta tus ventas registradas en la organización."}
          </p>
        </div>
        {accessContext.canManage ? (
          <Button asChild className="w-full md:w-auto">
            <Link href={`/org/${orgSlug}/preventa/nueva`}>
              <PlusIcon className="mr-2 h-4 w-4" weight="bold" />
              Nueva preventa
            </Link>
          </Button>
        ) : null}
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

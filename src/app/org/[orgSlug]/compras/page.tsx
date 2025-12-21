import { PlusIcon } from "@phosphor-icons/react/dist/ssr";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import Link from "next/link";
import { PurchasesMetrics } from "@/components/purchases/purchases-metrics";
import { Button } from "@/components/ui/button";
import { getQueryClient } from "@/lib/get-query-client";
import { getPurchaseOrdersByOrgSlug } from "@/modules/purchases/service/purchases.service";
import { PurchasesDataTable } from "./data-table";

type PurchasesPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function PurchasesPage({ params }: PurchasesPageProps) {
  const { orgSlug } = await params;
  const queryClient = getQueryClient();

  const purchases = await getPurchaseOrdersByOrgSlug(orgSlug);

  await queryClient.prefetchQuery({
    queryKey: ["purchases", orgSlug],
    queryFn: async () => purchases,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl">Compras</h1>
          <p className="text-muted-foreground text-sm">
            Consulta todas las compras de la organización.
          </p>
        </div>
        <Button asChild>
          <Link href={`/org/${orgSlug}/compras/nueva`}>
            <PlusIcon className="mr-2 h-4 w-4" weight="bold" />
            Nueva compra
          </Link>
        </Button>
      </div>

      <PurchasesMetrics purchases={purchases} />

      <HydrationBoundary state={dehydrate(queryClient)}>
        <PurchasesDataTable orgSlug={orgSlug} />
      </HydrationBoundary>
    </div>
  );
}

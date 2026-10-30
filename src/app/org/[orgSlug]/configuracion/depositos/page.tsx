import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/get-query-client";
import { warehouseAdministrationQueryOptions } from "@/modules/inventory/queries/warehouse-administration.queries";
import { WarehouseAdministration } from "./warehouse-administration";

type DepositosPageProps = {
  params: Promise<{ orgSlug: string }>;
};

export default async function DepositosPage({ params }: DepositosPageProps) {
  const { orgSlug } = await params;
  const queryClient = getQueryClient();

  await queryClient.prefetchQuery(warehouseAdministrationQueryOptions(orgSlug));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Depósitos</h1>
        <p className="text-muted-foreground text-sm">
          Administrá depósitos, canales de operación y el acceso de cada
          usuario.
        </p>
      </div>

      <HydrationBoundary state={dehydrate(queryClient)}>
        <WarehouseAdministration orgSlug={orgSlug} />
      </HydrationBoundary>
    </div>
  );
}

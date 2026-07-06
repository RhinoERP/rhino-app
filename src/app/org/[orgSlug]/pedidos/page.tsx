import { PackageIcon } from "@phosphor-icons/react/ssr";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { Suspense } from "react";
import { OrdersMetrics } from "@/components/orders/orders-metrics";
import { OrdersTable } from "@/components/orders/orders-table";
import { getQueryClient } from "@/lib/get-query-client";
import { ordersServerQueryOptions } from "@/modules/orders/queries/queries.server";
import {
  computeOrderMetrics,
  getOrdersByOrg,
} from "@/modules/orders/service/orders.service";
import {
  guardOrganizationModuleAccess,
  guardOrganizationPermissionAccess,
} from "@/modules/organizations/service/module-access.service";

type OrdersPageProps = {
  params: Promise<{ orgSlug: string }>;
};

export default async function OrdersPage({ params }: OrdersPageProps) {
  const { orgSlug } = await params;
  await guardOrganizationModuleAccess(orgSlug, "production");
  await guardOrganizationPermissionAccess(orgSlug, [
    "orders.read",
    "orders.finance_review",
    "orders.stock_review",
    "orders.production",
    "orders.dispatch",
  ]);
  const queryClient = getQueryClient();
  const orders = await getOrdersByOrg(orgSlug);
  const metrics = computeOrderMetrics(orders);

  await queryClient.prefetchQuery(ordersServerQueryOptions(orgSlug));

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <PackageIcon className="h-6 w-6" weight="duotone" />
          <h1 className="font-heading text-2xl">Pedidos</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Gestiona y da seguimiento a todos los pedidos de la organización.
        </p>
      </div>

      <OrdersMetrics metrics={metrics} />

      <HydrationBoundary state={dehydrate(queryClient)}>
        <Suspense fallback={<div>Cargando...</div>}>
          <OrdersTable orders={orders} orgSlug={orgSlug} />
        </Suspense>
      </HydrationBoundary>
    </div>
  );
}

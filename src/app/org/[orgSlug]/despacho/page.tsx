import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { Suspense } from "react";
import { DispatchMetrics } from "@/components/orders/dispatch-metrics";
import { DispatchOrdersList } from "@/components/orders/dispatch-orders-list";
import { getQueryClient } from "@/lib/get-query-client";
import { ordersServerQueryOptions } from "@/modules/orders/queries/queries.server";
import {
  computeDispatchMetrics,
  getChildOrdersForDispatch,
  getOrdersRevertInfo,
} from "@/modules/orders/service/orders.service";
import {
  guardOrganizationModuleAccess,
  guardOrganizationPermissionAccess,
} from "@/modules/organizations/service/module-access.service";

type DispatchPageProps = {
  params: Promise<{ orgSlug: string }>;
};

export default async function DispatchPage({ params }: DispatchPageProps) {
  const { orgSlug } = await params;
  await guardOrganizationModuleAccess(orgSlug, "production");
  await guardOrganizationPermissionAccess(orgSlug, "orders.dispatch");

  const queryClient = getQueryClient();
  const orders = await getChildOrdersForDispatch(orgSlug);
  const metrics = computeDispatchMetrics(orders);

  const revertInfoMap = await getOrdersRevertInfo(
    orgSlug,
    orders.map((o) => o.id)
  );

  await queryClient.prefetchQuery(ordersServerQueryOptions(orgSlug));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Despacho</h1>
        <p className="text-muted-foreground text-sm">
          Gestiona la preparación y el envío de pedidos.
        </p>
      </div>

      <DispatchMetrics metrics={metrics} />

      <HydrationBoundary state={dehydrate(queryClient)}>
        <Suspense fallback={<div>Cargando...</div>}>
          <DispatchOrdersList
            orders={orders}
            orgSlug={orgSlug}
            revertInfoMap={revertInfoMap}
          />
        </Suspense>
      </HydrationBoundary>
    </div>
  );
}

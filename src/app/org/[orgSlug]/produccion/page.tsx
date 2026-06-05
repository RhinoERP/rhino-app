import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { Suspense } from "react";
import { ProductionOrdersList } from "@/components/orders/production-orders-list";
import { getQueryClient } from "@/lib/get-query-client";
import { ordersServerQueryOptions } from "@/modules/orders/queries/queries.server";
import { getOrdersByOrg } from "@/modules/orders/service/orders.service";
import {
  guardOrganizationModuleAccess,
  guardOrganizationPermissionAccess,
} from "@/modules/organizations/service/module-access.service";

type ProductionPageProps = {
  params: Promise<{ orgSlug: string }>;
};

export default async function ProductionPage({ params }: ProductionPageProps) {
  const { orgSlug } = await params;
  await guardOrganizationModuleAccess(orgSlug, "production");
  await guardOrganizationPermissionAccess(orgSlug, "orders.read");

  const queryClient = getQueryClient();
  const orders = await getOrdersByOrg(orgSlug);
  const filteredOrders = orders.filter(
    (o) => o.status === "IN_PRODUCTION" || o.status === "DESIGN_REVIEW"
  );

  await queryClient.prefetchQuery(ordersServerQueryOptions(orgSlug));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Producción</h1>
        <p className="text-muted-foreground text-sm">
          Pedidos en producción y revisión de diseño.
        </p>
      </div>

      <HydrationBoundary state={dehydrate(queryClient)}>
        <Suspense fallback={<div>Cargando...</div>}>
          <ProductionOrdersList orders={filteredOrders} orgSlug={orgSlug} />
        </Suspense>
      </HydrationBoundary>
    </div>
  );
}

import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { Suspense } from "react";
import { StockOrdersReview } from "@/components/orders/stock-orders-review";
import { getQueryClient } from "@/lib/get-query-client";
import { ordersServerQueryOptions } from "@/modules/orders/queries/queries.server";
import { getOrdersByOrg } from "@/modules/orders/service/orders.service";
import {
  guardOrganizationModuleAccess,
  guardOrganizationPermissionAccess,
} from "@/modules/organizations/service/module-access.service";

type StockOrdersPageProps = {
  params: Promise<{ orgSlug: string }>;
};

export default async function StockOrdersPage({
  params,
}: StockOrdersPageProps) {
  const { orgSlug } = await params;
  await guardOrganizationModuleAccess(orgSlug, "production");
  await guardOrganizationPermissionAccess(orgSlug, "orders.read");
  const queryClient = getQueryClient();
  const orders = await getOrdersByOrg(orgSlug);
  const filteredOrders = orders.filter((o) =>
    [
      "PENDING_STOCK",
      "STOCK_OK",
      "PURCHASE_REQUIRED",
      "PURCHASING",
      "GOODS_RECEIVED",
    ].includes(o.status)
  );

  await queryClient.prefetchQuery(ordersServerQueryOptions(orgSlug));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Stock de Pedidos</h1>
        <p className="text-muted-foreground text-sm">
          Revisa el stock y gestiona las compras necesarias para los pedidos.
        </p>
      </div>

      <HydrationBoundary state={dehydrate(queryClient)}>
        <Suspense fallback={<div>Cargando...</div>}>
          <StockOrdersReview orders={filteredOrders} orgSlug={orgSlug} />
        </Suspense>
      </HydrationBoundary>
    </div>
  );
}

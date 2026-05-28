import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { redirect } from "next/navigation";
import { StockOrdersReview } from "@/components/orders/stock-orders-review";
import { getQueryClient } from "@/lib/get-query-client";
import { getOrdersAction } from "@/modules/orders/actions/get-orders.action";
import { ordersServerQueryOptions } from "@/modules/orders/queries/queries.server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

type StockOrdersPageProps = {
  params: Promise<{ orgSlug: string }>;
};

export default async function StockOrdersPage({
  params,
}: StockOrdersPageProps) {
  const { orgSlug } = await params;

  const organization = await getOrganizationBySlug(orgSlug);
  if (!organization) {
    redirect("/");
  }

  const queryClient = getQueryClient();

  const allOrders = await getOrdersAction(orgSlug);

  await queryClient.prefetchQuery(ordersServerQueryOptions(orgSlug));

  const orders = allOrders.filter((o) =>
    [
      "PENDING_STOCK",
      "STOCK_OK",
      "PURCHASE_REQUIRED",
      "PURCHASING",
      "GOODS_RECEIVED",
    ].includes(o.status)
  );

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className="flex-1 space-y-6 p-4 pt-6 md:p-8">
        <div>
          <h1 className="font-bold text-3xl tracking-tight">
            Stock de Pedidos
          </h1>
          <p className="text-muted-foreground text-sm">
            Verificá el stock disponible y gestioná las órdenes de compra
            necesarias.
          </p>
        </div>
        <StockOrdersReview orders={orders} orgSlug={orgSlug} />
      </div>
    </HydrationBoundary>
  );
}

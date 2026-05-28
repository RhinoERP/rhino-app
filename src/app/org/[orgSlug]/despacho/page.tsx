import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { redirect } from "next/navigation";
import { DispatchOrdersList } from "@/components/orders/dispatch-orders-list";
import { getQueryClient } from "@/lib/get-query-client";
import { getOrdersAction } from "@/modules/orders/actions/get-orders.action";
import { ordersServerQueryOptions } from "@/modules/orders/queries/queries.server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

type DispatchPageProps = {
  params: Promise<{ orgSlug: string }>;
};

export default async function DispatchPage({ params }: DispatchPageProps) {
  const { orgSlug } = await params;

  const organization = await getOrganizationBySlug(orgSlug);
  if (!organization) {
    redirect("/");
  }

  const queryClient = getQueryClient();

  const allOrders = await getOrdersAction(orgSlug);

  await queryClient.prefetchQuery(ordersServerQueryOptions(orgSlug));
  const orders = allOrders.filter((o) =>
    ["PREPARING", "DISPATCHED", "DELIVERED"].includes(o.status)
  );

  const preparing = orders.filter((o) => o.status === "PREPARING").length;
  const dispatched = orders.filter((o) => o.status === "DISPATCHED").length;
  const delivered = orders.filter((o) => o.status === "DELIVERED").length;

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className="flex-1 space-y-6 p-4 pt-6 md:p-8">
        <div>
          <h1 className="font-bold text-3xl tracking-tight">
            Despacho y Entrega
          </h1>
          <p className="text-muted-foreground text-sm">
            Preparación, despacho y confirmación de entrega de pedidos.
          </p>
        </div>

        {/* Métricas */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-muted-foreground text-xs">Preparando</p>
            <p className="mt-1 font-bold text-2xl text-cyan-600">{preparing}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-muted-foreground text-xs">En camino</p>
            <p className="mt-1 font-bold text-2xl text-blue-600">
              {dispatched}
            </p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-muted-foreground text-xs">Entregados</p>
            <p className="mt-1 font-bold text-2xl text-emerald-600">
              {delivered}
            </p>
          </div>
        </div>

        <DispatchOrdersList orders={orders} orgSlug={orgSlug} />
      </div>
    </HydrationBoundary>
  );
}

import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { redirect } from "next/navigation";
import { FinanceOrdersReview } from "@/components/orders/finance-orders-review";
import { getQueryClient } from "@/lib/get-query-client";
import { getOrdersAction } from "@/modules/orders/actions/get-orders.action";
import { ordersServerQueryOptions } from "@/modules/orders/queries/queries.server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

type FinanceOrdersPageProps = {
  params: Promise<{ orgSlug: string }>;
};

export default async function FinanceOrdersPage({
  params,
}: FinanceOrdersPageProps) {
  const { orgSlug } = await params;

  const organization = await getOrganizationBySlug(orgSlug);
  if (!organization) {
    redirect("/");
  }

  const queryClient = getQueryClient();

  const allOrders = await getOrdersAction(orgSlug);

  await queryClient.prefetchQuery(ordersServerQueryOptions(orgSlug));

  // Solo los que están en estado PENDING_FINANCE o FINANCE_REJECTED
  const orders = allOrders.filter((o) =>
    ["PENDING_FINANCE", "FINANCE_REJECTED"].includes(o.status)
  );

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className="space-y-6">
        <div>
          <h2 className="font-semibold text-xl">Aprobación de Pedidos</h2>
          <p className="text-muted-foreground text-sm">
            Revisá los pedidos pendientes y aprobá o rechazá según los
            estándares de rentabilidad.
          </p>
        </div>
        <FinanceOrdersReview orders={orders} orgSlug={orgSlug} />
      </div>
    </HydrationBoundary>
  );
}

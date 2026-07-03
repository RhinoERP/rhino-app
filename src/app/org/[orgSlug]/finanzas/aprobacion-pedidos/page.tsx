import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { Suspense } from "react";
import { FinanceOrdersReview } from "@/components/orders/finance-orders-review";
import { getQueryClient } from "@/lib/get-query-client";
import { ordersServerQueryOptions } from "@/modules/orders/queries/queries.server";
import {
  getOrdersByOrg,
  getOrdersRevertInfo,
} from "@/modules/orders/service/orders.service";
import {
  guardOrganizationModuleAccess,
  guardOrganizationPermissionAccess,
} from "@/modules/organizations/service/module-access.service";

type FinanceApprovalPageProps = {
  params: Promise<{ orgSlug: string }>;
};

export default async function FinanceApprovalPage({
  params,
}: FinanceApprovalPageProps) {
  const { orgSlug } = await params;
  await guardOrganizationModuleAccess(orgSlug, "production");
  await guardOrganizationPermissionAccess(orgSlug, "orders.finance_review");

  const queryClient = getQueryClient();
  const orders = await getOrdersByOrg(orgSlug);
  const filteredOrders = orders.filter(
    (o) => o.status === "PENDING_FINANCE" || o.status === "FINANCE_REJECTED"
  );

  const revertInfoMap = await getOrdersRevertInfo(
    orgSlug,
    filteredOrders.map((o) => o.id)
  );

  await queryClient.prefetchQuery(ordersServerQueryOptions(orgSlug));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Aprobación de Pedidos</h1>
        <p className="text-muted-foreground text-sm">
          Revisa y aprueba pedidos pendientes de autorización financiera.
        </p>
      </div>

      <HydrationBoundary state={dehydrate(queryClient)}>
        <Suspense fallback={<div>Cargando...</div>}>
          <FinanceOrdersReview
            orders={filteredOrders}
            orgSlug={orgSlug}
            revertInfoMap={revertInfoMap}
          />
        </Suspense>
      </HydrationBoundary>
    </div>
  );
}

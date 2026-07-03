import { Suspense } from "react";
import { StockOrdersReview } from "@/components/orders/stock-orders-review";
import {
  getOrdersRevertInfo,
  getParentOrdersPendingStock,
  getPurchasingOrders,
} from "@/modules/orders/service/orders.service";
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
  await guardOrganizationPermissionAccess(orgSlug, "orders.stock_review");
  const [orders, purchasingOrders] = await Promise.all([
    getParentOrdersPendingStock(orgSlug),
    getPurchasingOrders(orgSlug),
  ]);

  const parentIds = orders.map((o) => o.id);
  const childIds = orders.flatMap((o) => o.children.map((c) => c.id));
  const purchasingChildIds = purchasingOrders.map((o) => o.id);

  const revertInfoMap = await getOrdersRevertInfo(orgSlug, [
    ...parentIds,
    ...childIds,
    ...purchasingChildIds,
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Stock de Pedidos</h1>
        <p className="text-muted-foreground text-sm">
          Revisa el stock y gestiona las compras necesarias para los pedidos.
        </p>
      </div>

      <Suspense fallback={<div>Cargando...</div>}>
        <StockOrdersReview
          orders={orders}
          orgSlug={orgSlug}
          purchasingOrders={purchasingOrders}
          revertInfoMap={revertInfoMap}
        />
      </Suspense>
    </div>
  );
}

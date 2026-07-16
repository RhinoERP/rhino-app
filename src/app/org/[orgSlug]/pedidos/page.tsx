import { PackageIcon } from "@phosphor-icons/react/ssr";
import { Suspense } from "react";
import { OrdersMetrics } from "@/components/orders/orders-metrics";
import { OrdersTable } from "@/components/orders/orders-table";
import {
  getOrdersMetrics,
  getOrdersPaginated,
} from "@/modules/orders/service/orders.service";
import type { OrderFlowStatus, SortParam } from "@/modules/orders/types";
import {
  guardOrganizationModuleAccess,
  guardOrganizationPermissionAccess,
} from "@/modules/organizations/service/module-access.service";

type OrdersPageProps = {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{
    page?: string;
    perPage?: string;
    sort?: string;
    search?: string;
    estado?: string;
  }>;
};

export default async function OrdersPage({
  params,
  searchParams,
}: OrdersPageProps) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  await guardOrganizationModuleAccess(orgSlug, "production");
  await guardOrganizationPermissionAccess(orgSlug, [
    "orders.read",
    "orders.finance_review",
    "orders.stock_review",
    "orders.production",
    "orders.dispatch",
  ]);

  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(sp.perPage) || 20));
  const search = sp.search || undefined;

  let sort: SortParam[] | undefined;
  if (sp.sort) {
    try {
      sort = JSON.parse(sp.sort);
    } catch {
      sort = undefined;
    }
  }

  let status: OrderFlowStatus | undefined;
  if (sp.estado && sp.estado !== "ALL") {
    status = sp.estado as OrderFlowStatus;
  }

  const [paginated, metrics] = await Promise.all([
    getOrdersPaginated(orgSlug, { page, pageSize, sort, search, status }),
    getOrdersMetrics(orgSlug),
  ]);

  const pageCount = Math.max(1, Math.ceil(paginated.totalCount / pageSize));

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

      <Suspense fallback={<div>Cargando...</div>}>
        <OrdersTable
          initialData={paginated.data}
          orgSlug={orgSlug}
          pageCount={pageCount}
        />
      </Suspense>
    </div>
  );
}

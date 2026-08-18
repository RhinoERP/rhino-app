import { PackageIcon } from "@phosphor-icons/react/ssr";
import { Suspense } from "react";
import { OrdersMetrics } from "@/components/orders/orders-metrics";
import { OrdersTable } from "@/components/orders/orders-table";
import { parseSearchParams } from "@/lib/parse-search-params";
import {
  getOrdersMetrics,
  getOrdersPaginated,
} from "@/modules/orders/service/orders.service";
import type { OrderFlowStatus } from "@/modules/orders/types";
import {
  guardOrganizationModuleAccess,
  guardOrganizationPermissionAccess,
} from "@/modules/organizations/service/module-access.service";
import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";

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
  await guardOrganizationPermissionAccess(orgSlug, READ_PERMISSIONS.orders);

  const { page, pageSize, search, sort } = parseSearchParams(sp, 20);

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

import { PackageIcon } from "@phosphor-icons/react/ssr";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { redirect } from "next/navigation";
import { OrdersTable } from "@/components/orders/orders-table";
import { getQueryClient } from "@/lib/get-query-client";
import { getOrdersAction } from "@/modules/orders/actions/get-orders.action";
import { ordersServerQueryOptions } from "@/modules/orders/queries/queries.server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

type PedidosPageProps = {
  params: Promise<{ orgSlug: string }>;
};

export default async function PedidosPage({ params }: PedidosPageProps) {
  const { orgSlug } = await params;

  const organization = await getOrganizationBySlug(orgSlug);
  if (!organization) {
    redirect("/");
  }

  const queryClient = getQueryClient();

  const orders = await getOrdersAction(orgSlug);

  await queryClient.prefetchQuery(ordersServerQueryOptions(orgSlug));

  // Contadores por estado
  const pending = orders.filter((o) =>
    ["PENDING_FINANCE", "PENDING_STOCK", "IN_PRODUCTION", "PREPARING"].includes(
      o.status
    )
  ).length;
  const active = orders.filter(
    (o) => !["DELIVERED", "CANCELLED", "FINANCE_REJECTED"].includes(o.status)
  ).length;

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className="flex-1 space-y-6 p-4 pt-6 md:p-8">
        {/* Header */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <PackageIcon className="h-5 w-5 text-primary" weight="duotone" />
            </div>
            <div>
              <h1 className="font-bold text-3xl tracking-tight">
                Estado de Pedidos
              </h1>
              <p className="text-muted-foreground text-sm">
                Seguimiento completo del flujo de cada pedido en tiempo real.
              </p>
            </div>
          </div>
        </div>

        {/* Métricas rápidas */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <MetricCard label="Total pedidos" value={orders.length} />
          <MetricCard highlight label="En curso" value={active} />
          <MetricCard
            highlight={pending > 0}
            label="Requieren acción"
            urgent={pending > 0}
            value={pending}
          />
          <MetricCard
            label="Entregados"
            value={orders.filter((o) => o.status === "DELIVERED").length}
          />
        </div>

        {/* Tabla */}
        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20 text-center">
            <PackageIcon
              className="mb-3 h-10 w-10 text-muted-foreground/40"
              weight="duotone"
            />
            <p className="font-medium text-muted-foreground">
              No hay pedidos todavía
            </p>
            <p className="mt-1 text-muted-foreground/60 text-sm">
              Los pedidos se crean desde la sección de Presupuestos cuando el
              cliente aprueba.
            </p>
          </div>
        ) : (
          <OrdersTable orders={orders} orgSlug={orgSlug} />
        )}
      </div>
    </HydrationBoundary>
  );
}

function getValueColor(urgent: boolean, highlight: boolean): string {
  if (urgent) {
    return "text-orange-600 dark:text-orange-400";
  }
  if (highlight) {
    return "text-primary";
  }
  return "text-foreground";
}

function MetricCard({
  label,
  value,
  highlight = false,
  urgent = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  urgent?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        urgent
          ? "border-orange-500/30 bg-orange-500/5"
          : "border-border bg-card"
      }`}
    >
      <p className="text-muted-foreground text-xs">{label}</p>
      <p
        className={`mt-1 font-bold text-2xl ${getValueColor(urgent, highlight)}`}
      >
        {value}
      </p>
    </div>
  );
}

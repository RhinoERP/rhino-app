/**
 * Control Tower Tab - Torre de Control
 * Operational metrics and KPIs
 */

"use client";

import {
  PackageIcon,
  ShoppingCartIcon,
  UsersThreeIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/format";
import { useControlTowerData } from "@/modules/dashboard/hooks/use-dashboard";
import type { DashboardFilters } from "@/types/dashboard";
import { CriticalStockDataTable } from "./critical-stock-data-table";
import { OrderBoardDataTable } from "./order-board-data-table";
import { TopClientsDataTable } from "./top-clients-data-table";
import { TopProductsDataTable } from "./top-products-data-table";

type ControlTowerTabProps = {
  orgSlug: string;
  startDate: Date;
  endDate: Date;
  filters?: DashboardFilters;
};

export function ControlTowerTab({
  orgSlug,
  startDate,
  endDate,
  filters = {},
}: ControlTowerTabProps) {
  const { data, isPending, error } = useControlTowerData(
    orgSlug,
    startDate,
    endDate,
    filters
  );

  if (error) {
    return (
      <div className="text-destructive">
        Error cargando datos: {error.message}
      </div>
    );
  }

  if (isPending || !data) {
    return <ControlTowerSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Orders Delivered */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="font-medium text-sm">
              Pedidos Entregados
            </CardTitle>
            <PackageIcon
              className="size-4 text-muted-foreground"
              weight="duotone"
            />
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="font-bold text-2xl">
              {data.kpis.orders.delivered}
            </div>
            <p className="text-muted-foreground text-xs">
              de {data.kpis.orders.total} totales
            </p>
          </CardContent>
        </Card>

        {/* Pending Orders */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="font-medium text-sm">
              Pedidos Pendientes
            </CardTitle>
            <WarningIcon className="size-4 text-yellow-500" weight="duotone" />
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="font-bold text-2xl">{data.kpis.orders.pending}</div>
            {data.kpis.orders.delayed > 0 && (
              <p className="text-red-500 text-xs">
                {data.kpis.orders.delayed} demorados
              </p>
            )}
          </CardContent>
        </Card>

        {/* Active Customers */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="font-medium text-sm">
              Clientes Activos
            </CardTitle>
            <UsersThreeIcon
              className="size-4 text-muted-foreground"
              weight="duotone"
            />
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="font-bold text-2xl">
              {data.kpis.customers.active}
            </div>
            <p className="text-muted-foreground text-xs">
              {data.kpis.customers.inactive} inactivos
            </p>
          </CardContent>
        </Card>

        {/* Pending Purchases */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="font-medium text-sm">
              Compras Pendientes
            </CardTitle>
            <ShoppingCartIcon
              className="size-4 text-muted-foreground"
              weight="duotone"
            />
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="font-bold text-2xl">
              {data.kpis.purchases.pending}
            </div>
            <p className="text-muted-foreground text-xs">órdenes abiertas</p>
          </CardContent>
        </Card>
      </div>

      {/* Comprehensive Alerts Section */}
      {(data.stockAlerts.critical.length > 0 ||
        data.stockAlerts.slowMoving.length > 0 ||
        data.stockAlerts.expiringLots.length > 0 ||
        data.kpis.orders.delayed > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <WarningIcon className="size-5 text-red-500" weight="duotone" />
              Alertas y Excepciones
            </CardTitle>
            <CardDescription>
              Situaciones que requieren atención inmediata
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs className="w-full" defaultValue="critical">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="critical">
                  Sin Stock ({data.stockAlerts.critical.length})
                </TabsTrigger>
                <TabsTrigger value="slow">
                  Baja Rotación ({data.stockAlerts.slowMoving.length})
                </TabsTrigger>
                <TabsTrigger value="expiring">
                  Lotes a Vencer ({data.stockAlerts.expiringLots.length})
                </TabsTrigger>
                <TabsTrigger value="delayed">
                  Pedidos Demorados ({data.kpis.orders.delayed})
                </TabsTrigger>
              </TabsList>

              {/* Critical Stock Tab */}
              <TabsContent className="mt-4" value="critical">
                {data.stockAlerts.critical.length > 0 ? (
                  <CriticalStockDataTable data={data.stockAlerts.critical} />
                ) : (
                  <p className="py-8 text-center text-muted-foreground text-sm">
                    No hay productos sin stock
                  </p>
                )}
              </TabsContent>

              {/* Slow Moving Tab */}
              <TabsContent className="mt-4" value="slow">
                {data.stockAlerts.slowMoving.length > 0 ? (
                  <SlowMovingTable data={data.stockAlerts.slowMoving} />
                ) : (
                  <p className="py-8 text-center text-muted-foreground text-sm">
                    No hay productos con baja rotación
                  </p>
                )}
              </TabsContent>

              {/* Expiring Lots Tab */}
              <TabsContent className="mt-4" value="expiring">
                {data.stockAlerts.expiringLots.length > 0 ? (
                  <ExpiringLotsTable data={data.stockAlerts.expiringLots} />
                ) : (
                  <p className="py-8 text-center text-muted-foreground text-sm">
                    No hay lotes próximos a vencer
                  </p>
                )}
              </TabsContent>

              {/* Delayed Orders Tab */}
              <TabsContent className="mt-4" value="delayed">
                {data.kpis.orders.delayed > 0 ? (
                  <DelayedOrdersTable
                    data={data.orderBoard.filter(
                      (order) => order.status !== "DELIVERED"
                    )}
                  />
                ) : (
                  <p className="py-8 text-center text-muted-foreground text-sm">
                    No hay pedidos demorados
                  </p>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Top Performers */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Top Clients */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Top 5 Clientes por Volumen
            </CardTitle>
            <CardDescription>Clientes con mayor facturación</CardDescription>
          </CardHeader>
          <CardContent>
            <TopClientsDataTable data={data.topPerformers.topClients} />
          </CardContent>
        </Card>

        {/* Top Products */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Top 5 Productos por Unidades
            </CardTitle>
            <CardDescription>Productos más vendidos</CardDescription>
          </CardHeader>
          <CardContent>
            <TopProductsDataTable data={data.topPerformers.topProducts} />
          </CardContent>
        </Card>
      </div>

      {/* Order Status Board */}
      {data.orderBoard.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Estado de Pedidos</CardTitle>
            <CardDescription>
              Flujo operativo de pedidos en tiempo real
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OrderBoardDataTable data={data.orderBoard.slice(0, 10)} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================================
// Slow Moving Products Table
// ============================================================================

function SlowMovingTable({
  data,
}: {
  data: Array<{
    id: string;
    name: string;
    sku: string;
    current_stock: number;
    last_movement_date: string | null;
    days_since_movement: number | null;
  }>;
}) {
  return (
    <div className="rounded-md border">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-4 py-3 text-left font-medium text-sm">
              Producto
            </th>
            <th className="px-4 py-3 text-right font-medium text-sm">Stock</th>
            <th className="px-4 py-3 text-right font-medium text-sm">
              Días sin Movimiento
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((product) => (
            <tr className="border-b last:border-0" key={product.id}>
              <td className="px-4 py-3">
                <div>
                  <p className="font-medium text-sm">{product.name}</p>
                  <p className="text-muted-foreground text-xs">{product.sku}</p>
                </div>
              </td>
              <td className="px-4 py-3 text-right font-medium text-sm">
                {product.current_stock}
              </td>
              <td className="px-4 py-3 text-right">
                <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 font-medium text-xs text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                  {product.days_since_movement ?? "N/A"} días
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// Expiring Lots Table
// ============================================================================

function ExpiringLotsTable({
  data,
}: {
  data: Array<{
    lot_id: string;
    lot_number: string;
    expiration_date: string;
    quantity_available: number;
    unit_quantity_available: number;
    product_id: string;
    product_name: string;
    product_sku: string;
    unit_of_measure: string;
    days_until_expiration: number;
    is_expired: boolean;
  }>;
}) {
  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

  const getExpirationBadge = (
    daysUntilExpiration: number,
    isExpired: boolean
  ) => {
    if (isExpired) {
      return {
        label: "Vencido",
        className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
      };
    }
    if (daysUntilExpiration <= 7) {
      return {
        label: `${daysUntilExpiration}d`,
        className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
      };
    }
    if (daysUntilExpiration <= 30) {
      return {
        label: `${daysUntilExpiration}d`,
        className:
          "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
      };
    }
    if (daysUntilExpiration <= 60) {
      return {
        label: `${daysUntilExpiration}d`,
        className:
          "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      };
    }
    return {
      label: `${daysUntilExpiration}d`,
      className:
        "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    };
  };

  return (
    <div className="rounded-md border">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-4 py-3 text-left font-medium text-sm">
              Producto
            </th>
            <th className="px-4 py-3 text-left font-medium text-sm">Lote</th>
            <th className="px-4 py-3 text-right font-medium text-sm">Stock</th>
            <th className="px-4 py-3 text-right font-medium text-sm">
              Vencimiento
            </th>
            <th className="px-4 py-3 text-right font-medium text-sm">
              Días Restantes
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((lot) => {
            const badge = getExpirationBadge(
              lot.days_until_expiration,
              lot.is_expired
            );
            const totalStock =
              lot.unit_of_measure === "UN"
                ? lot.quantity_available
                : lot.unit_quantity_available;

            return (
              <tr className="border-b last:border-0" key={lot.lot_id}>
                <td className="px-4 py-3">
                  <div>
                    <p className="font-medium text-sm">{lot.product_name}</p>
                    <p className="text-muted-foreground text-xs">
                      {lot.product_sku}
                    </p>
                  </div>
                </td>
                <td className="px-4 py-3 font-medium text-sm">
                  {lot.lot_number}
                </td>
                <td className="px-4 py-3 text-right font-medium text-sm">
                  {totalStock} {lot.unit_of_measure}
                </td>
                <td className="px-4 py-3 text-right text-sm">
                  {formatDate(lot.expiration_date)}
                </td>
                <td className="px-4 py-3 text-right">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-medium text-xs ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// Delayed Orders Table
// ============================================================================

function DelayedOrdersTable({
  data,
}: {
  data: Array<{
    id: string;
    invoiceNumber: string | null;
    customerName: string;
    totalAmount: number;
    saleDate: string;
    status: string;
    daysOld: number;
  }>;
}) {
  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

  // Status mapping matching order-board-columns.tsx
  const getStatusInfo = (status: string) => {
    const statusMap: Record<
      string,
      {
        label: string;
        variant: "default" | "secondary" | "destructive" | "outline";
      }
    > = {
      ORDERED: { label: "Ordenada", variant: "secondary" },
      IN_TRANSIT: { label: "En tránsito", variant: "default" },
      RECEIVED: { label: "Recibida", variant: "outline" },
      CANCELLED: { label: "Cancelada", variant: "destructive" },
      DISPATCH: { label: "Despachada", variant: "default" },
      CONFIRMED: { label: "Confirmada", variant: "secondary" },
      DELIVERED: { label: "Entregada", variant: "outline" },
      DRAFT: { label: "Borrador", variant: "secondary" },
    };

    return (
      statusMap[status] || { label: status, variant: "secondary" as const }
    );
  };

  return (
    <div className="rounded-md border">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-4 py-3 text-left font-medium text-sm">Pedido</th>
            <th className="px-4 py-3 text-left font-medium text-sm">Cliente</th>
            <th className="px-4 py-3 text-right font-medium text-sm">Monto</th>
            <th className="px-4 py-3 text-right font-medium text-sm">Fecha</th>
            <th className="px-4 py-3 text-right font-medium text-sm">
              Días Pendiente
            </th>
            <th className="px-4 py-3 text-center font-medium text-sm">
              Estado
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((order) => {
            const statusInfo = getStatusInfo(order.status);
            return (
              <tr className="border-b last:border-0" key={order.id}>
                <td className="px-4 py-3 font-medium text-sm">
                  {order.invoiceNumber || `#${order.id.slice(0, 8)}`}
                </td>
                <td className="px-4 py-3 text-sm">{order.customerName}</td>
                <td className="px-4 py-3 text-right font-medium text-sm">
                  {formatCurrency(order.totalAmount)}
                </td>
                <td className="px-4 py-3 text-right text-sm">
                  {formatDate(order.saleDate)}
                </td>
                <td className="px-4 py-3 text-right">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-medium text-xs ${
                      order.daysOld > 7
                        ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                        : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                    }`}
                  >
                    {order.daysOld} días
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ControlTowerSkeleton() {
  return (
    <div className="space-y-6">
      {/* KPI Cards Grid Skeleton */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => `kpi-skeleton-${i}`).map((key) => (
          <Card key={key}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="size-4 rounded" />
            </CardHeader>
            <CardContent className="space-y-1">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts/Tables Grid Skeleton */}
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => `chart-skeleton-${i}`).map(
          (key) => (
            <Card key={key}>
              <CardHeader>
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-64" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-64 w-full" />
              </CardContent>
            </Card>
          )
        )}
      </div>

      {/* Order Board Skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-96 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

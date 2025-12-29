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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    return <div>Cargando...</div>;
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

      {/* Alerts Section */}
      {data.stockAlerts.critical.length > 0 && (
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
            <CriticalStockDataTable data={data.stockAlerts.critical} />
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

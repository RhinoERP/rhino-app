"use client";

/**
 * KPI Cards Grid
 * Tarjetas de métricas principales
 */

import { TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardData } from "@/modules/dashboard/types";

type KPICardsGridProps = {
  data: DashboardData;
};

export function KPICardsGrid({ data }: KPICardsGridProps) {
  const kpis = [
    {
      title: "Pedidos Entrantes Hoy",
      value: data.ordersMetrics.total.toString(),
      subtitle: `+${data.operationalKPIs.sales.percentageChange.toFixed(0)}% vs ayer`,
      trend: data.operationalKPIs.sales.percentageChange > 0 ? "up" : "down",
    },
    {
      title: "Entregas Completadas",
      value: data.ordersMetrics.delivered.toString(),
      subtitle: "3 pendientes de entrega",
    },
    {
      title: "Pedidos Retrasados",
      value: data.ordersMetrics.delayed.toString(),
      subtitle: "Requieren atención inmediata",
      variant: data.ordersMetrics.delayed > 0 ? "warning" : "default",
    },
    {
      title: "Entregas en Curso",
      value: data.operationalKPIs.pendingDelivery.count.toString(),
      subtitle: `${data.ordersMetrics.pending} repartos en la calle`,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi) => (
        <Card key={kpi.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">{kpi.title}</CardTitle>
            {kpi.trend &&
              (kpi.trend === "up" ? (
                <TrendingUpIcon className="h-4 w-4 text-green-600" />
              ) : (
                <TrendingDownIcon className="h-4 w-4 text-red-600" />
              ))}
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{kpi.value}</div>
            <p className="text-muted-foreground text-xs">{kpi.subtitle}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

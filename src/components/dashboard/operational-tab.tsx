"use client"; /** * Torre de Control Tab * Vista operativa del día a día */
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardData } from "@/modules/dashboard/types";
import { AlertsAndExceptions } from "./alerts-and-exceptions";
import { CriticalStockDataTable } from "./critical-stock-data-table";
import { KPICardsGrid } from "./kpi-cards-grid";
import { OrdersKanban } from "./orders-kanban";

type OperationalTabProps = { data: DashboardData };
export function OperationalTab({ data }: OperationalTabProps) {
  return (
    <div className="space-y-6">
      {" "}
      {/* KPIs Grid - Main operational metrics */} <KPICardsGrid data={data} />{" "}
      {/* Alerts and Exceptions Section */} <AlertsAndExceptions data={data} />{" "}
      {/* Orders Kanban View */} <OrdersKanban data={data} />{" "}
      {/* Critical Stock Products */}{" "}
      {data.criticalStockProducts.length > 0 && (
        <Card>
          {" "}
          <CardHeader>
            {" "}
            <CardTitle>Productos con Stock Crítico</CardTitle>{" "}
            <p className="text-muted-foreground text-sm">
              {" "}
              Productos que requieren atención inmediata{" "}
            </p>{" "}
          </CardHeader>{" "}
          <CardContent>
            {" "}
            <CriticalStockDataTable
              products={data.criticalStockProducts}
            />{" "}
          </CardContent>{" "}
        </Card>
      )}{" "}
      {/* Stock Metrics Overview */}{" "}
      <Card>
        {" "}
        <CardHeader>
          {" "}
          <CardTitle>Semáforo de Stock</CardTitle>{" "}
        </CardHeader>{" "}
        <CardContent>
          {" "}
          <div className="grid grid-cols-3 gap-4">
            {" "}
            <div className="space-y-2">
              {" "}
              <div className="flex items-center gap-2">
                {" "}
                <Badge variant="destructive">Crítico</Badge>{" "}
                <span className="text-muted-foreground text-sm">
                  {" "}
                  Riesgo de quiebre{" "}
                </span>{" "}
              </div>{" "}
              <p className="font-bold text-3xl">
                {data.stockMetrics.critical}
              </p>{" "}
            </div>{" "}
            <div className="space-y-2">
              {" "}
              <div className="flex items-center gap-2">
                {" "}
                <Badge className="bg-green-600" variant="default">
                  {" "}
                  Saludable{" "}
                </Badge>{" "}
                <span className="text-muted-foreground text-sm">
                  {" "}
                  Stock justo{" "}
                </span>{" "}
              </div>{" "}
              <p className="font-bold text-3xl">
                {data.stockMetrics.healthy}
              </p>{" "}
            </div>{" "}
            <div className="space-y-2">
              {" "}
              <div className="flex items-center gap-2">
                {" "}
                <Badge variant="secondary">Lento</Badge>{" "}
                <span className="text-muted-foreground text-sm">
                  {" "}
                  Inmovilizado{" "}
                </span>{" "}
              </div>{" "}
              <p className="font-bold text-3xl">
                {data.stockMetrics.slow}
              </p>{" "}
            </div>{" "}
          </div>{" "}
        </CardContent>{" "}
      </Card>{" "}
    </div>
  );
}

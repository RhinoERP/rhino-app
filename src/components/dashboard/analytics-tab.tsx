"use client";

/**
 * Analytics Tab
 * Análisis y tendencias del negocio
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardData } from "@/modules/dashboard/types";
import { CustomerMarginsDataTable } from "./customer-margins-data-table";
import { ProductMarginsDataTable } from "./product-margins-data-table";
import { TopClientsDataTable } from "./top-clients-data-table";
import { TopProductsDataTable } from "./top-products-data-table";

type AnalyticsTabProps = {
  data: DashboardData;
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function AnalyticsTab({ data }: AnalyticsTabProps) {
  return (
    <div className="space-y-6">
      {/* Top Clients and Products Analytics */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top 5 Clientes por Volumen</CardTitle>
          </CardHeader>
          <CardContent>
            <TopClientsDataTable clients={data.topClients} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top 5 Productos por Unidades</CardTitle>
          </CardHeader>
          <CardContent>
            <TopProductsDataTable products={data.topProducts} />
          </CardContent>
        </Card>
      </div>

      {/* Margins Analysis */}
      <Card>
        <CardHeader>
          <CardTitle>Análisis de Márgenes</CardTitle>
          <p className="text-muted-foreground text-sm">
            Rentabilidad y tendencias por línea de productos
          </p>
        </CardHeader>
        <CardContent>
          <div className="mb-6 grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <p className="text-muted-foreground text-sm">Margen Promedio</p>
              <p className="font-bold text-2xl">
                {data.marginMetrics.averageMarginPercentage.toFixed(1)}%
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground text-sm">Ingresos Totales</p>
              <p className="font-bold text-2xl">
                {formatCurrency(data.marginMetrics.totalRevenue)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground text-sm">Costos Totales</p>
              <p className="font-bold text-2xl">
                {formatCurrency(data.marginMetrics.totalCost)}
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="mb-3 font-medium text-sm">
                Productos de Alto Margen con Baja Rotación
              </h4>
              <p className="mb-3 text-muted-foreground text-sm">
                Oportunidades de optimización de inventario
              </p>
              <ProductMarginsDataTable margins={data.productMargins} />
            </div>

            <div>
              <h4 className="mb-3 font-medium text-sm">Margen por Cliente</h4>
              <p className="mb-3 text-muted-foreground text-sm">
                Rentabilidad por cliente
              </p>
              <CustomerMarginsDataTable margins={data.customerMargins} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Insights */}
      {data.insights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Insights del Negocio</CardTitle>
            <p className="text-muted-foreground text-sm">
              Recomendaciones basadas en datos
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.insights.map((insight) => {
                let borderColor = "border-blue-200 bg-blue-50";
                if (insight.type === "success") {
                  borderColor = "border-green-200 bg-green-50";
                } else if (insight.type === "warning") {
                  borderColor = "border-orange-200 bg-orange-50";
                }

                return (
                  <div
                    className={`flex items-start gap-3 rounded-lg border p-3 ${borderColor}`}
                    key={insight.id}
                  >
                    <div className="flex-1">
                      <p className="font-medium text-sm">{insight.message}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

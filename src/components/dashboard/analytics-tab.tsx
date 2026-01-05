/**
 * Analytics Tab V2 - Analytics & Insights
 * Professional layout: Clients (full width) + Brands/Products (half width each)
 */

"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useProfitabilityMetrics } from "@/modules/dashboard/hooks/use-dashboard";
import type { DashboardFilters } from "@/types/dashboard";
import { ProfitabilityChartSingle } from "./profitability-chart";

type AnalyticsTabProps = {
  orgSlug: string;
  startDate: Date;
  endDate: Date;
  filters?: DashboardFilters;
};

export function AnalyticsTab({
  orgSlug,
  startDate,
  endDate,
}: AnalyticsTabProps) {
  // Fetch data for all three views
  const {
    data: clientsData,
    isPending: isLoadingClients,
    error: clientsError,
  } = useProfitabilityMetrics(orgSlug, startDate, endDate, "CLIENT");

  const {
    data: brandsData,
    isPending: isLoadingBrands,
    error: brandsError,
  } = useProfitabilityMetrics(orgSlug, startDate, endDate, "BRAND");

  const {
    data: productsData,
    isPending: isLoadingProducts,
    error: productsError,
  } = useProfitabilityMetrics(orgSlug, startDate, endDate, "PRODUCT");

  // Show error if any of the queries failed
  const error = clientsError || brandsError || productsError;
  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
        <h3 className="mb-2 font-semibold text-destructive">
          Error cargando datos de rentabilidad
        </h3>
        <p className="text-destructive text-sm">{error.message}</p>
        <details className="mt-4">
          <summary className="cursor-pointer text-muted-foreground text-xs">
            Detalles técnicos
          </summary>
          <pre className="mt-2 overflow-auto rounded bg-muted p-2 text-xs">
            {JSON.stringify(error, null, 2)}
          </pre>
        </details>
      </div>
    );
  }

  // Show loading state
  if (isLoadingClients && isLoadingBrands && isLoadingProducts) {
    return <AnalyticsSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Main Chart: Clients (Full Width) */}
      <ProfitabilityChartSingle
        data={clientsData || []}
        description="Top 10 clientes más rentables del período"
        height={400}
        isLoading={isLoadingClients}
        title="Rentabilidad por Clientes"
      />

      {/* Secondary Charts: Brands and Products (Half Width Each) */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ProfitabilityChartSingle
          data={brandsData || []}
          description="Top 10 marcas más rentables"
          height={350}
          isLoading={isLoadingBrands}
          title="Rentabilidad por Marcas"
        />
        <ProfitabilityChartSingle
          data={productsData || []}
          description="Top 10 productos más rentables"
          height={350}
          isLoading={isLoadingProducts}
          title="Rentabilidad por Productos"
        />
      </div>
    </div>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Main Chart Skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-64" />
          <Skeleton className="mt-2 h-4 w-96" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[400px] w-full" />
        </CardContent>
      </Card>

      {/* Secondary Charts Skeleton */}
      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => `analytics-skeleton-${i}`).map(
          (key) => (
            <Card key={key}>
              <CardHeader>
                <Skeleton className="h-5 w-48" />
                <Skeleton className="mt-2 h-4 w-64" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-[350px] w-full" />
              </CardContent>
            </Card>
          )
        )}
      </div>
    </div>
  );
}

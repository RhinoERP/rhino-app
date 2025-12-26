/**
 * Dashboard Page
 * Torre de Control - Métricas operativas y financieras
 */

import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { Suspense } from "react";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { Skeleton } from "@/components/ui/skeleton";
import { getQueryClient } from "@/lib/get-query-client";
import { dashboardDataQueryOptions } from "@/modules/dashboard/queries/queries.client";
import type { DateRangePreset } from "@/modules/dashboard/types";
import { getDateRangeFromPreset } from "@/modules/dashboard/utils/date-utils";

type DashboardPageProps = {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ range?: string }>;
};

export default async function DashboardPage({
  params,
  searchParams,
}: DashboardPageProps) {
  const { orgSlug } = await params;
  const { range } = await searchParams;

  // Validar y obtener el preset del rango de fechas
  const validPresets: DateRangePreset[] = [
    "today",
    "week",
    "month",
    "year",
    "last30",
  ];
  const dateRangePreset: DateRangePreset = validPresets.includes(
    range as DateRangePreset
  )
    ? (range as DateRangePreset)
    : "month";

  const dateRange = getDateRangeFromPreset(dateRangePreset);

  // Pre-fetch data en el servidor
  const queryClient = getQueryClient();

  try {
    await queryClient.prefetchQuery(
      dashboardDataQueryOptions(orgSlug, dateRange)
    );
  } catch (error) {
    console.error("Error prefetching dashboard data:", error);
    // Continuar sin prefetch, el cliente intentará cargar los datos
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardClient orgSlug={orgSlug} />
      </Suspense>
    </HydrationBoundary>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-5 w-96" />
        </div>
        <Skeleton className="h-10 w-[180px]" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => `kpi-skeleton-${i}`).map((key) => (
          <Skeleton className="h-32" key={key} />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => `card-skeleton-${i}`).map(
          (key) => (
            <Skeleton className="h-48" key={key} />
          )
        )}
      </div>
    </div>
  );
}

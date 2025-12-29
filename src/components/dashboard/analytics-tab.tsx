/**
 * Analytics Tab V2 - Analytics & Insights
 * Advanced analytics and business intelligence
 */

"use client";

import { useControlTowerData } from "@/modules/dashboard/hooks/use-dashboard";
import type { DashboardFilters } from "@/types/dashboard";
import { MarginsByCategoryChart } from "./margins-by-category-chart";

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
  filters = {},
}: AnalyticsTabProps) {
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
      {/* Margins by Category - Full Width */}
      <MarginsByCategoryChart data={data.marginsByCategory} />
    </div>
  );
}

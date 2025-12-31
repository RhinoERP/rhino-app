/**
 * Dashboard V2 Client - Torre de Control
 * Main client component with tab-based navigation
 */

"use client";

import { parseAsStringLiteral, useQueryStates } from "nuqs";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getDateRangeFromPreset } from "@/modules/dashboard/utils/date-utils";
import type { DashboardFilters, DateRangePreset } from "@/types/dashboard";
import { AnalyticsTab } from "./analytics-tab";
import { ControlTowerTab } from "./control-tower-tab";
import { DashboardFiltersComponent } from "./dashboard-filters";
import { DateRangeSelector } from "./date-range-selector";
import { FinancialTab } from "./financial-tab";

type DashboardClientProps = {
  orgSlug: string;
  defaultPreset?: DateRangePreset;
  defaultTab?: "control" | "financial" | "analytics";
};

export function DashboardClient({
  orgSlug,
  defaultPreset = "month",
  defaultTab = "control",
}: DashboardClientProps) {
  const [{ range, tab }, setParams] = useQueryStates({
    range: parseAsStringLiteral([
      "today",
      "week",
      "month",
      "year",
      "last30",
    ] as const).withDefault(defaultPreset),
    tab: parseAsStringLiteral([
      "control",
      "financial",
      "analytics",
    ] as const).withDefault(defaultTab),
  });

  const dateRange = getDateRangeFromPreset(range);

  // Filters state
  const [filters, setFilters] = useState<DashboardFilters>({
    customerId: null,
    supplierId: null,
  });

  const handleRangeChange = (newRange: DateRangePreset) => {
    setParams({ range: newRange });
  };

  const handleTabChange = (newTab: "control" | "financial" | "analytics") => {
    setParams({ tab: newTab });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="font-heading text-3xl">Torre de Control</h1>
          <p className="text-muted-foreground">
            Métricas operativas y financieras en tiempo real
          </p>
        </div>

        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
          <DashboardFiltersComponent
            filters={filters}
            onChange={setFilters}
            orgSlug={orgSlug}
          />
          <DateRangeSelector onChange={handleRangeChange} value={range} />
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        className="space-y-6"
        onValueChange={(value) => handleTabChange(value as typeof tab)}
        value={tab}
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="control">Torre de Control</TabsTrigger>
          <TabsTrigger value="financial">Administración de Saldos</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent className="space-y-6" value="control">
          <ControlTowerTab
            endDate={dateRange.to}
            filters={filters}
            orgSlug={orgSlug}
            startDate={dateRange.from}
          />
        </TabsContent>

        <TabsContent className="space-y-6" value="financial">
          <FinancialTab
            endDate={dateRange.to}
            filters={filters}
            orgSlug={orgSlug}
            startDate={dateRange.from}
          />
        </TabsContent>

        <TabsContent className="space-y-6" value="analytics">
          <AnalyticsTab
            endDate={dateRange.to}
            filters={filters}
            orgSlug={orgSlug}
            startDate={dateRange.from}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Dashboard V2 Client - Torre de Control
 * Main client component with tab-based navigation
 */

"use client";

import { parseAsStringLiteral, useQueryStates } from "nuqs";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getDateRangeFromPreset } from "@/modules/dashboard/utils/date-utils";
import type {
  DashboardFilters,
  DashboardTab,
  DateRangePreset,
} from "@/types/dashboard";
import { AnalyticsTab } from "./analytics-tab";
import { ControlTowerTab } from "./control-tower-tab";
import { DashboardFiltersComponent } from "./dashboard-filters";
import { DateRangeSelector } from "./date-range-selector";
import { DirectSalesTab } from "./direct-sales-tab";
import { FinancialTab } from "./financial-tab";
import { ReportSettingsDialog } from "./report-settings-dialog";

type DashboardClientProps = {
  orgSlug: string;
  defaultPreset?: DateRangePreset;
  defaultTab?: DashboardTab;
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
      "lastYear",
    ] as const).withDefault(defaultPreset),
    tab: parseAsStringLiteral([
      "control",
      "financial",
      "direct-sales",
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

  const handleTabChange = (newTab: DashboardTab) => {
    setParams({ tab: newTab });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl">Torre de Control</h1>
          <p className="text-muted-foreground">
            Métricas operativas y financieras en tiempo real
          </p>
        </div>

        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
          <ReportSettingsDialog orgSlug={orgSlug} />
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
        <TabsList className="mb-2 grid h-auto w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="control">Torre de Control</TabsTrigger>
          <TabsTrigger value="financial">Administración de Saldos</TabsTrigger>
          <TabsTrigger value="direct-sales">Venta Directa</TabsTrigger>
          <TabsTrigger value="analytics">Rentabilidad</TabsTrigger>
        </TabsList>

        <TabsContent className="space-y-4" value="control">
          <ControlTowerTab
            endDate={dateRange.to}
            filters={filters}
            orgSlug={orgSlug}
            startDate={dateRange.from}
          />
        </TabsContent>

        <TabsContent className="space-y-4" value="financial">
          <FinancialTab
            endDate={dateRange.to}
            filters={filters}
            orgSlug={orgSlug}
            startDate={dateRange.from}
          />
        </TabsContent>

        <TabsContent className="space-y-4" value="direct-sales">
          <DirectSalesTab
            endDate={dateRange.to}
            orgSlug={orgSlug}
            startDate={dateRange.from}
          />
        </TabsContent>

        <TabsContent className="space-y-4" value="analytics">
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

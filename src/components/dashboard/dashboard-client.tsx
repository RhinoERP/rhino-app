"use client";

/**
 * Dashboard Client Component
 * Componente principal del cliente para Torre de Control
 */

import { parseAsStringLiteral, useQueryState } from "nuqs";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDashboardData } from "@/modules/dashboard/hooks/use-dashboard-data";
import { getDateRangeFromPreset } from "@/modules/dashboard/utils/date-utils";
import { AnalyticsTab } from "./analytics-tab";
import { DateRangeSelector } from "./date-range-selector";
import { FinancialTab } from "./financial-tab";
import { OperationalTab } from "./operational-tab";

type DashboardClientProps = {
  orgSlug: string;
};

export function DashboardClient({ orgSlug }: DashboardClientProps) {
  const [dateRangePreset] = useQueryState(
    "range",
    parseAsStringLiteral([
      "today",
      "week",
      "month",
      "year",
      "last30",
    ]).withDefault("month")
  );

  const dateRange = getDateRangeFromPreset(dateRangePreset);
  const { data } = useDashboardData(orgSlug, dateRange);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl">Torre de Control</h1>
          <p className="text-muted-foreground text-sm">
            Métricas operativas y financieras en tiempo real
          </p>
        </div>
        <DateRangeSelector />
      </div>

      {/* Tabs */}
      <Tabs className="w-full" defaultValue="operational">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="operational">Torre de Control</TabsTrigger>
          <TabsTrigger value="financial">Administración de Saldos</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent className="mt-6 space-y-6" value="operational">
          <OperationalTab data={data} />
        </TabsContent>

        <TabsContent className="mt-6 space-y-6" value="financial">
          <FinancialTab data={data} />
        </TabsContent>

        <TabsContent className="mt-6 space-y-6" value="analytics">
          <AnalyticsTab data={data} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

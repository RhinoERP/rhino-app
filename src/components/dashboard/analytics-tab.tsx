"use client";

import { RentabilidadClientes } from "@/modules/dashboard/components/rentabilidad-clientes";
import type { DashboardFilters } from "@/types/dashboard";

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
  return (
    <RentabilidadClientes
      endDate={endDate}
      orgSlug={orgSlug}
      startDate={startDate}
    />
  );
}

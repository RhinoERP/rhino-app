"use client";

/**
 * Date Range Selector Component
 * Selector de rango de fechas con sincronización de URL
 */

import { parseAsStringLiteral, useQueryState } from "nuqs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DateRangePreset } from "@/modules/dashboard/types";

const DATE_RANGE_PRESETS = [
  { value: "today", label: "Hoy" },
  { value: "week", label: "Esta Semana" },
  { value: "month", label: "Este Mes" },
  { value: "year", label: "Este Año" },
  { value: "last30", label: "Últimos 30 días" },
] as const;

export function DateRangeSelector() {
  const [dateRange, setDateRange] = useQueryState(
    "range",
    parseAsStringLiteral([
      "today",
      "week",
      "month",
      "year",
      "last30",
    ]).withDefault("month")
  );

  return (
    <Select
      onValueChange={(value) => setDateRange(value as DateRangePreset)}
      value={dateRange}
    >
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Seleccionar período" />
      </SelectTrigger>
      <SelectContent>
        {DATE_RANGE_PRESETS.map((preset) => (
          <SelectItem key={preset.value} value={preset.value}>
            {preset.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

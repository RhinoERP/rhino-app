/**
 * Date Range Selector V2
 * Component for selecting date range presets
 */

"use client";

import { CalendarIcon } from "@phosphor-icons/react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DateRangePreset } from "@/types/dashboard";

type DateRangeSelectorProps = {
  value: DateRangePreset;
  onChange: (preset: DateRangePreset) => void;
};

const presetLabels: Record<DateRangePreset, string> = {
  today: "Hoy",
  week: "Esta Semana",
  month: "Este Mes",
  year: "Este Año",
  last30: "Últimos 30 días",
};

export function DateRangeSelector({ value, onChange }: DateRangeSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <CalendarIcon className="size-4 text-muted-foreground" weight="duotone" />
      <Select onValueChange={onChange} value={value}>
        <SelectTrigger className="w-[180px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(presetLabels).map(([preset, label]) => (
            <SelectItem key={preset} value={preset}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

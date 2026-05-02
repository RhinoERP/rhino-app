"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FinancialPeriodKey } from "@/modules/finances/types";

const PERIOD_OPTIONS: Array<{ value: FinancialPeriodKey; label: string }> = [
  { value: "este-mes", label: "Este mes" },
  { value: "mes-anterior", label: "Mes anterior" },
  { value: "trimestre", label: "Este trimestre" },
  { value: "este-año", label: "Este año" },
  { value: "custom", label: "Personalizado" },
];

type PeriodSelectorProps = {
  className?: string;
};

export function PeriodSelector({ className }: PeriodSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current =
    (searchParams.get("periodo") as FinancialPeriodKey) ?? "este-mes";
  const isCustom = current === "custom";

  const [localDesde, setLocalDesde] = useState(searchParams.get("desde") ?? "");
  const [localHasta, setLocalHasta] = useState(searchParams.get("hasta") ?? "");

  useEffect(() => {
    setLocalDesde(searchParams.get("desde") ?? "");
    setLocalHasta(searchParams.get("hasta") ?? "");
  }, [searchParams]);

  const update = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set(key, value);
      router.push(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const commitDesde = useCallback(() => {
    if (localDesde) {
      update("desde", localDesde);
    }
  }, [localDesde, update]);

  const commitHasta = useCallback(() => {
    if (localHasta) {
      update("hasta", localHasta);
    }
  }, [localHasta, update]);

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>
      <Select onValueChange={(v) => update("periodo", v)} value={current}>
        <SelectTrigger className="w-44">
          <SelectValue placeholder="Período" />
        </SelectTrigger>
        <SelectContent>
          {PERIOD_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isCustom && (
        <>
          <input
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            onBlur={commitDesde}
            onChange={(e) => setLocalDesde(e.target.value)}
            type="date"
            value={localDesde}
          />
          <span className="text-muted-foreground text-sm">hasta</span>
          <input
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            onBlur={commitHasta}
            onChange={(e) => setLocalHasta(e.target.value)}
            type="date"
            value={localHasta}
          />
        </>
      )}
    </div>
  );
}

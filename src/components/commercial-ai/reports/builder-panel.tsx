"use client";

import {
  CaretDownIcon,
  FunnelSimpleIcon,
  SlidersHorizontalIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  type Dataset,
  PERIOD_PRESETS,
  type ReportSpec,
} from "@/modules/commercial-ai/reports/catalog";
import { ReportBuilder } from "./report-builder";

function Pill({
  children,
  muted,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-[260px] items-center gap-1 truncate rounded-full px-2.5 py-1 text-xs",
        muted ? "text-muted-foreground" : "bg-muted"
      )}
    >
      {children}
    </span>
  );
}

function periodText(spec: ReportSpec, dataset: Dataset): string {
  if (!dataset.dated) {
    return "Foto de hoy";
  }
  if (spec.period === "personalizado" && spec.from && spec.to) {
    return `${spec.from.split("-").reverse().join("/")} al ${spec.to.split("-").reverse().join("/")}`;
  }
  return PERIOD_PRESETS.find((p) => p.key === spec.period)?.label ?? "";
}

/**
 * El constructor plegado: arriba se ve un resumen de cómo está armado el
 * reporte y se abre para cambiarlo. Así el gráfico queda a la vista.
 */
export function BuilderPanel({
  spec,
  dataset,
  datasets,
  filterOptions,
  onChange,
}: {
  spec: ReportSpec;
  dataset: Dataset;
  datasets: Dataset[];
  filterOptions: Record<string, string[]>;
  onChange: (next: ReportSpec) => void;
}) {
  const [open, setOpen] = useState(false);
  const group = dataset.dimensions.find((d) => d.key === spec.groupBy);
  const split = dataset.dimensions.find((d) => d.key === spec.splitBy);
  const measures = spec.measures
    .map((key) => dataset.measures.find((m) => m.key === key)?.label)
    .filter(Boolean);

  return (
    <div className="rounded-xl border bg-card">
      <button
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-1.5 rounded-xl p-2 pl-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <SlidersHorizontalIcon className="mr-0.5 size-4 text-muted-foreground" />
        <Pill>{dataset.label}</Pill>
        <Pill>
          {group ? `por ${group.label.toLowerCase()}` : "solo totales"}
        </Pill>
        {split ? <Pill>abierto por {split.label.toLowerCase()}</Pill> : null}
        <Pill>{periodText(spec, dataset)}</Pill>
        {spec.filters.map((f) => (
          <Pill key={f.dimension}>
            <FunnelSimpleIcon className="size-3 shrink-0" />
            {dataset.dimensions.find((d) => d.key === f.dimension)?.label}:{" "}
            {f.values.join(", ")}
          </Pill>
        ))}
        <Pill muted>{measures.join(", ")}</Pill>
        <span className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-primary text-sm">
          {open ? "Listo" : "Ajustar"}
          <CaretDownIcon
            className={cn(
              "size-3.5 transition-transform",
              open && "rotate-180"
            )}
          />
        </span>
      </button>
      {open ? (
        <div className="motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 border-t p-1 motion-safe:animate-in">
          <div className="[&>div]:border-0 [&>div]:shadow-none">
            <ReportBuilder
              dataset={dataset}
              datasets={datasets}
              filterOptions={filterOptions}
              onChange={onChange}
              spec={spec}
            />
          </div>
          <div className="flex justify-end px-3 pb-2">
            <Button onClick={() => setOpen(false)} size="sm" variant="ghost">
              Ocultar opciones
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

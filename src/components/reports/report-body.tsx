"use client";

import { ArrowUUpLeftIcon, HandPointingIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Dataset, ReportSpec } from "@/modules/reports/catalog";
import { drillSpec, isDateDimension } from "@/modules/reports/explore";
import type { ReportResult } from "@/modules/reports/run-report";
import { FocusPanel, ReportHighlights } from "./report-explore";
import { ReportChart, ReportKpis, ReportTable } from "./report-view";

/** Qué métrica muestra el gráfico y qué valor está elegido; se reinician si cambia el reporte. */
function useExploreState(report: ReportResult) {
  const measures = report.measures.map((m) => m.key).join();
  const [measureKey, setMeasureKey] = useState(report.measures[0]?.key ?? "");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: se reinicia cuando cambian las métricas
  useEffect(() => {
    setMeasureKey((prev) =>
      report.measures.some((m) => m.key === prev)
        ? prev
        : (report.measures[0]?.key ?? "")
    );
  }, [measures]);
  useEffect(() => {
    setSelectedKey((prev) =>
      prev && report.rows.some((r) => r.key === prev) ? prev : null
    );
  }, [report.rows]);
  return { measureKey, setMeasureKey, selectedKey, setSelectedKey };
}

function EmptyReport() {
  return (
    <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground text-sm">
      No hay datos para este período o estos filtros. Probá con otro período o
      sacá algún filtro.
    </div>
  );
}

function groupsByDate(dataset: Dataset, report: ReportResult): boolean {
  const key = report.spec.groupBy;
  return (
    isDateDimension(dataset, key) ||
    key === "mes_alta" ||
    key === "mes_vencimiento"
  );
}

function ReportNotes({ notes }: { notes: string[] }) {
  if (!notes.length) {
    return null;
  }
  return (
    <ul className="space-y-0.5 text-muted-foreground text-xs">
      {notes.map((note) => (
        <li key={note}>· {note}</li>
      ))}
    </ul>
  );
}

const HINTS: Partial<Record<ReportSpec["chart"], string>> = {
  pie: "una porción",
  line: "un punto",
  area: "un punto",
  bar: "una barra",
};

/** El escenario del gráfico: lo destacado, el gráfico y la ficha del valor elegido. */
function ChartStage({
  report,
  measureKey,
  selectedKey,
  onSelect,
  byDate,
  focus,
}: {
  report: ReportResult;
  measureKey: string;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  byDate: boolean;
  focus: React.ReactNode;
}) {
  const hint = HINTS[report.spec.chart] ?? "una barra";
  return (
    <section className="rounded-2xl border bg-[radial-gradient(var(--border)_1px,transparent_1px)] bg-card p-3 [background-size:16px_16px] md:p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <ReportHighlights
            measureKey={measureKey}
            onSelect={onSelect}
            report={report}
          />
        </div>
        {selectedKey ? null : (
          <p className="flex items-center gap-1 text-muted-foreground text-xs">
            <HandPointingIcon className="size-3.5" />
            Tocá {hint} para ver el detalle
          </p>
        )}
      </div>
      {report.series.length ? (
        <p className="mb-2 text-muted-foreground text-xs">
          {report.measures[0]?.label} abierto por{" "}
          {report.splitLabel?.toLowerCase()}
        </p>
      ) : null}
      <div
        className={cn(
          "grid gap-3",
          focus && "lg:grid-cols-[minmax(0,1fr)_300px]"
        )}
      >
        <div className="min-w-0 rounded-xl bg-card/90">
          <ReportChart
            byDate={byDate}
            canExplore
            key={`${report.spec.chart}-${report.spec.groupBy}`}
            measureKey={measureKey}
            onSelect={onSelect}
            report={report}
            selectedKey={selectedKey}
          />
        </div>
        {focus}
      </div>
    </section>
  );
}

export function ReportBody({
  report,
  dataset,
  loading,
  backLabel,
  onBack,
  onExplore,
}: {
  report: ReportResult;
  dataset: Dataset;
  loading: boolean;
  /** Si se profundizó: a qué reporte se vuelve. */
  backLabel: string | null;
  onBack: () => void;
  onExplore: (next: ReportSpec) => void;
}) {
  const { measureKey, setMeasureKey, selectedKey, setSelectedKey } =
    useExploreState(report);
  const byDate = groupsByDate(dataset, report);
  const grouped = Boolean(report.spec.groupBy);
  const hasChart = grouped && report.spec.chart !== "table";
  const selectedRow = report.rows.find((r) => r.key === selectedKey);

  const drill = (dimension: string) => {
    if (!selectedRow) {
      return;
    }
    const next = drillSpec(dataset, report.spec, selectedRow, dimension);
    if (next) {
      onExplore(next);
    }
  };

  const focus = selectedRow ? (
    <FocusPanel
      dataset={dataset}
      onClose={() => setSelectedKey(null)}
      onDrill={drill}
      report={report}
      rowKey={selectedRow.key}
    />
  ) : null;

  return (
    <div
      className={cn(
        "space-y-3 transition-opacity",
        loading && "pointer-events-none opacity-50"
      )}
    >
      {backLabel ? (
        <Button className="-ml-2" onClick={onBack} size="sm" variant="ghost">
          <ArrowUUpLeftIcon />
          Volver a {backLabel}
        </Button>
      ) : null}
      <ReportNotes notes={report.notes} />

      {report.factCount ? (
        <>
          <ReportKpis
            activeKey={measureKey}
            byDate={byDate}
            onSelect={setMeasureKey}
            report={report}
          />

          {hasChart ? (
            <ChartStage
              byDate={byDate}
              focus={focus}
              measureKey={measureKey}
              onSelect={setSelectedKey}
              report={report}
              selectedKey={selectedKey}
            />
          ) : null}

          {hasChart ? null : focus}

          {grouped ? (
            <ReportTable
              measureKey={measureKey}
              onSelect={setSelectedKey}
              report={report}
              selectedKey={selectedKey}
            />
          ) : null}
          <p className="text-muted-foreground text-xs">
            {report.factCount.toLocaleString("es-AR")} registros
            {grouped
              ? ` · ${report.groupCount.toLocaleString("es-AR")} grupos`
              : ""}
          </p>
        </>
      ) : (
        <EmptyReport />
      )}
    </div>
  );
}

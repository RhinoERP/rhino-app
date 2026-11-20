import type { MeasureFormat } from "@/modules/commercial-ai/reports/catalog";
import type { ReportResult } from "@/modules/commercial-ai/reports/run-report";

const MONEY = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});
const NUMBER = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const DECIMAL = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const MILLION = 1_000_000;
const NEEDS_QUOTES = /[";\n]/;
const QUOTE = /"/g;
const ACCENTS = /[\u0300-\u036f]/g;
const NOT_ALNUM = /[^a-zA-Z0-9]+/g;
const EDGE_DASHES = /(^-|-$)/g;
const THOUSAND = 1000;

export function formatValue(value: number, format: MeasureFormat): string {
  if (format === "money") {
    return MONEY.format(value);
  }
  if (format === "percent") {
    return `${DECIMAL.format(value)}%`;
  }
  if (format === "decimal") {
    return DECIMAL.format(value);
  }
  return NUMBER.format(value);
}

/** Corto para ejes y etiquetas: $1,2M, $350k. */
export function formatShort(value: number, format: MeasureFormat): string {
  const abs = Math.abs(value);
  const prefix = format === "money" ? "$" : "";
  const suffix = format === "percent" ? "%" : "";
  if (abs >= MILLION) {
    return `${prefix}${DECIMAL.format(value / MILLION)}M${suffix}`;
  }
  if (abs >= THOUSAND * 10) {
    return `${prefix}${NUMBER.format(value / THOUSAND)}k${suffix}`;
  }
  return `${prefix}${format === "number" ? NUMBER.format(value) : DECIMAL.format(value)}${suffix}`;
}

/** Variación contra el período anterior (null si no hay base). */
export function delta(
  current: number,
  previous: number | undefined
): number | null {
  if (previous === undefined || previous === 0) {
    return null;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function formatDelta(value: number | null): string {
  if (value === null) {
    return "—";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${DECIMAL.format(Math.round(value * 10) / 10)}%`;
}

/** Filas planas (encabezados legibles) para exportar. */
export function exportRows(
  report: ReportResult
): Record<string, string | number>[] {
  const groupHeader = report.groupLabel ?? "Total";
  return report.rows.map((row) => {
    const out: Record<string, string | number> = { [groupHeader]: row.label };
    for (const m of report.measures) {
      out[m.label] = Math.round((row.values[m.key] ?? 0) * 100) / 100;
      const prev = report.previousByKey?.[row.key]?.[m.key];
      if (report.previousByKey) {
        out[`${m.label} (anterior)`] = Math.round((prev ?? 0) * 100) / 100;
      }
    }
    for (const series of report.series) {
      out[`${report.measures[0]?.label} · ${series}`] =
        Math.round((row.split?.[series] ?? 0) * 100) / 100;
    }
    return out;
  });
}

function fileName(report: ReportResult, extension: string): string {
  const safe = report.title
    .normalize("NFD")
    .replace(ACCENTS, "")
    .replace(NOT_ALNUM, "-")
    .replace(EDGE_DASHES, "")
    .toLowerCase();
  return `${safe || "reporte"}.${extension}`;
}

export async function downloadExcel(report: ReportResult): Promise<void> {
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.json_to_sheet(exportRows(report));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Reporte");
  const info = XLSX.utils.aoa_to_sheet([
    ["Reporte", report.title],
    ["Datos", report.datasetLabel],
    ["Período", report.periodLabel ?? ""],
    [
      "Filtros",
      report.spec.filters
        .map((f) => `${f.dimension}: ${f.values.join(", ")}`)
        .join(" · ") || "Ninguno",
    ],
    ["Generado", new Date().toLocaleString("es-AR")],
  ]);
  XLSX.utils.book_append_sheet(book, info, "Info");
  XLSX.writeFile(book, fileName(report, "xlsx"));
}

export function downloadCsv(report: ReportResult): void {
  const rows = exportRows(report);
  const headers = Object.keys(rows[0] ?? {});
  const quote = (v: string | number) => {
    const text = String(v);
    return NEEDS_QUOTES.test(text) ? `"${text.replace(QUOTE, '""')}"` : text;
  };
  const csv = [
    headers.map(quote).join(";"),
    ...rows.map((r) => headers.map((h) => quote(r[h] ?? "")).join(";")),
  ].join("\n");
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName(report, "csv");
  link.click();
  URL.revokeObjectURL(url);
}

/** Paleta para series: tonos distinguibles en claro y oscuro. */
export const SERIES_COLORS = [
  "#2A58AA",
  "#0E8A6B",
  "#D97706",
  "#B83D2A",
  "#7044A8",
  "#0E7490",
  "#9E6508",
  "#8A3E6A",
  "#64748B",
];

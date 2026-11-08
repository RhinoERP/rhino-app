import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  requireCommercialAiAccess,
  todayInArgentina,
} from "../service/commercial-ai.service";
import {
  aggregate,
  applyFilters,
  type FactRow,
  filterOptions,
  type ReportRow,
} from "./aggregate";
import {
  canUseDataset,
  DATASETS,
  type Dataset,
  datasetById,
  type MeasureFormat,
  PERIOD_PRESETS,
  type ReportSpec,
  sanitizeSpec,
} from "./catalog";
import { createDatasetReader, type LoadResult, MAX_ROWS } from "./loaders";
import {
  type DateRange,
  formatRange,
  previousRange,
  resolveRange,
} from "./periods";

export type ReportColumn = {
  key: string;
  label: string;
  format: MeasureFormat;
  /** Se puede sumar entre grupos (tiene sentido el % del total). */
  additive: boolean;
};

export type ReportResult = {
  spec: ReportSpec;
  title: string;
  datasetLabel: string;
  periodLabel: string | null;
  range: DateRange | null;
  previousRange: DateRange | null;
  groupLabel: string | null;
  splitLabel: string | null;
  measures: ReportColumn[];
  rows: ReportRow[];
  totals: Record<string, number>;
  previousTotals: Record<string, number> | null;
  /** Valores del período anterior por fila (misma clave), para comparar. */
  previousByKey: Record<string, Record<string, number>> | null;
  series: string[];
  groupCount: number;
  factCount: number;
  filterOptions: Record<string, string[]>;
  notes: string[];
};

export type ReportAccess = {
  orgSlug: string;
  organizationId: string;
  userId: string;
  userName: string;
  isManager: boolean;
  permissions: string[];
};

export async function resolveReportAccess(
  orgSlug: string
): Promise<ReportAccess> {
  const access = await requireCommercialAiAccess(orgSlug);
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_user_org_permissions_by_slug", {
    target_org_slug: orgSlug,
  });
  return {
    orgSlug,
    organizationId: access.organizationId,
    userId: access.userId,
    userName: access.userName,
    isManager: access.role === "gerente",
    permissions: (data ?? []) as string[],
  };
}

/** Fuentes que este usuario puede usar. */
export function availableDatasets(access: ReportAccess): Dataset[] {
  return DATASETS.filter((d) => canUseDataset(d, access.permissions));
}

export class ReportError extends Error {}

function periodText(spec: ReportSpec, range: DateRange): string {
  const preset = PERIOD_PRESETS.find((p) => p.key === spec.period);
  return spec.period === "personalizado" || !preset
    ? formatRange(range)
    : `${preset.label} (${formatRange(range)})`;
}

function defaultTitle(dataset: Dataset, spec: ReportSpec): string {
  const measure = dataset.measures.find((m) => m.key === spec.measures[0]);
  const group = dataset.dimensions.find((d) => d.key === spec.groupBy);
  const by = group ? ` por ${group.label.toLowerCase()}` : "";
  return `${measure?.label ?? dataset.label}${by}`;
}

function byKey(rows: ReportRow[]): Record<string, Record<string, number>> {
  return Object.fromEntries(rows.map((r) => [r.key, r.values]));
}

function compareWith(
  previous: LoadResult | null,
  dataset: Dataset,
  spec: ReportSpec
): {
  previousTotals: Record<string, number> | null;
  previousByKey: Record<string, Record<string, number>> | null;
} {
  if (!previous) {
    return { previousTotals: null, previousByKey: null };
  }
  const rows: FactRow[] = applyFilters(
    previous.rows,
    spec.filters,
    dataset,
    spec.grain
  );
  const agg = aggregate(rows, dataset, { ...spec, limit: null });
  // Comparar fila a fila solo tiene sentido si no se agrupa por fecha.
  const byDate = dataset.dimensions.some(
    (d) => d.key === spec.groupBy && d.type === "date"
  );
  return {
    previousTotals: agg.totals,
    previousByKey: byDate ? null : byKey(agg.rows),
  };
}

function reportNotes(current: LoadResult, scoped: boolean): string[] {
  const notes = [...current.notes];
  if (current.truncated) {
    notes.push(
      `Hay más de ${MAX_ROWS.toLocaleString("es-AR")} registros: el reporte usa los primeros. Achicá el período para ver todo.`
    );
  }
  if (scoped) {
    notes.push("Ves solo los datos de tu cartera.");
  }
  return notes;
}

function measureColumns(dataset: Dataset, spec: ReportSpec): ReportColumn[] {
  return spec.measures
    .map((key) => dataset.measures.find((m) => m.key === key))
    .filter((m): m is Dataset["measures"][number] => Boolean(m))
    .map((m) => ({
      key: m.key,
      label: m.label,
      format: m.format,
      additive: m.agg.kind === "sum" || m.agg.kind === "count",
    }));
}

function checkedSpec(access: ReportAccess, input: Partial<ReportSpec>) {
  const spec = sanitizeSpec(input);
  if (!spec) {
    throw new ReportError("Elegí qué datos querés ver.");
  }
  const dataset = datasetById(spec.dataset) as Dataset;
  if (!canUseDataset(dataset, access.permissions)) {
    throw new ReportError(
      `No tenés permiso para ver ${dataset.label.toLowerCase()}.`
    );
  }
  return { spec, dataset };
}

/** Corre un reporte con los permisos y la cartera del usuario. */
export async function runReport(
  access: ReportAccess,
  input: Partial<ReportSpec>
): Promise<ReportResult> {
  const { spec, dataset } = checkedSpec(access, input);
  const today = todayInArgentina();
  const scoped = dataset.sellerScoped && !access.isManager;
  const read = createDatasetReader({
    db: (await createClient()) as unknown as SupabaseClient,
    organizationId: access.organizationId,
    orgSlug: access.orgSlug,
    today,
    restrictToUserId: scoped ? access.userId : null,
  });

  const range = dataset.dated ? resolveRange(spec, today) : null;
  const prev = range && spec.compare ? previousRange(range, spec.period) : null;
  const [current, previous] = await Promise.all([
    read(dataset.id, range ?? { from: today, to: today }),
    prev ? read(dataset.id, prev) : Promise.resolve(null),
  ]);

  const filtered = applyFilters(
    current.rows,
    spec.filters,
    dataset,
    spec.grain
  );
  const result = aggregate(filtered, dataset, spec);

  return {
    spec,
    title: spec.title || defaultTitle(dataset, spec),
    datasetLabel: dataset.label,
    periodLabel: range ? periodText(spec, range) : "Hoy",
    range,
    previousRange: prev,
    groupLabel:
      dataset.dimensions.find((d) => d.key === spec.groupBy)?.label ?? null,
    splitLabel:
      dataset.dimensions.find((d) => d.key === spec.splitBy)?.label ?? null,
    measures: measureColumns(dataset, spec),
    rows: result.rows,
    totals: result.totals,
    ...compareWith(previous, dataset, spec),
    series: result.series,
    groupCount: result.groupCount,
    factCount: filtered.length,
    filterOptions: filterOptions(current.rows, dataset),
    notes: reportNotes(current, scoped),
  };
}

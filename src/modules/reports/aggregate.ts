/**
 * Generador de reportes · agrupar y medir (puro, sin base ni red).
 */
import type { Aggregation, Dataset, ReportFilter, ReportSpec } from "./catalog";
import { dateBucket, weekdayOf, weekdayOrder } from "./periods";

export type FactRow = Record<string, string | number | null>;

export type ReportRow = {
  key: string;
  label: string;
  values: Record<string, number>;
  /** Valor de la primera métrica abierto por la segunda dimensión. */
  split?: Record<string, number>;
};

export type Aggregated = {
  rows: ReportRow[];
  totals: Record<string, number>;
  /** Series de la segunda dimensión, en orden (las más grandes primero). */
  series: string[];
  /** Cuántos grupos había antes de cortar en el top. */
  groupCount: number;
};

export const REST_KEY = "__resto__";
export const REST_LABEL = "Resto";
const EMPTY_LABEL = "Sin dato";
const MAX_SERIES = 8;

/** Tramos de antigüedad de una deuda, en orden. */
export const AGING_BUCKETS = [
  "Por vencer",
  "Vencido 1 a 30 días",
  "Vencido 31 a 60 días",
  "Vencido 61 a 90 días",
  "Vencido más de 90 días",
] as const;

export function agingBucket(dueDate: string | null, today: string): string {
  if (!dueDate || dueDate >= today) {
    return AGING_BUCKETS[0];
  }
  const days = Math.round(
    (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${dueDate}T12:00:00Z`)) /
      86_400_000
  );
  if (days <= 30) {
    return AGING_BUCKETS[1];
  }
  if (days <= 60) {
    return AGING_BUCKETS[2];
  }
  if (days <= 90) {
    return AGING_BUCKETS[3];
  }
  return AGING_BUCKETS[4];
}

const MONTH_DIMENSIONS = new Set(["mes_alta", "mes_vencimiento"]);
const ACCENTS = /[̀-ͯ]/g;

export function normalize(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(ACCENTS, "")
    .trim();
}

/* ============ Acumuladores ============ */

type Acc = {
  sum: number;
  count: number;
  den: number;
  set: Set<string> | null;
  denSet: Set<string> | null;
};

function newAcc(): Acc {
  return { sum: 0, count: 0, den: 0, set: null, denSet: null };
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function addTo(acc: Acc, agg: Aggregation, row: FactRow): void {
  acc.count += 1;
  if (agg.kind === "sum") {
    acc.sum += num(row[agg.field]);
    return;
  }
  if (agg.kind === "distinct") {
    const value = row[agg.field];
    if (value !== null && value !== undefined && value !== "") {
      acc.set ??= new Set();
      acc.set.add(String(value));
    }
    return;
  }
  if (agg.kind === "ratio") {
    acc.sum += num(row[agg.num]);
    if ("sum" in agg.den) {
      acc.den += num(row[agg.den.sum]);
    } else if ("distinct" in agg.den) {
      const value = row[agg.den.distinct];
      if (value !== null && value !== undefined) {
        acc.denSet ??= new Set();
        acc.denSet.add(String(value));
      }
    }
  }
}

function accValue(acc: Acc, agg: Aggregation): number {
  if (agg.kind === "sum") {
    return acc.sum;
  }
  if (agg.kind === "count") {
    return acc.count;
  }
  if (agg.kind === "distinct") {
    return acc.set?.size ?? 0;
  }
  let den = acc.den;
  if ("count" in agg.den) {
    den = acc.count;
  } else if ("distinct" in agg.den) {
    den = acc.denSet?.size ?? 0;
  }
  return den ? (acc.sum / den) * (agg.scale ?? 1) : 0;
}

/* ============ Dimensiones ============ */

export type DimValue = { key: string; label: string };

export function dimensionValue(
  row: FactRow,
  dimension: string,
  dataset: Dataset,
  grain: ReportSpec["grain"]
): DimValue {
  const def = dataset.dimensions.find((d) => d.key === dimension);
  if (def?.type === "date") {
    const iso = String(row.fecha ?? "");
    return iso ? dateBucket(iso, grain) : { key: "", label: EMPTY_LABEL };
  }
  if (MONTH_DIMENSIONS.has(dimension)) {
    const iso = String(row[dimension] ?? "");
    return iso ? dateBucket(iso, "mes") : { key: "~", label: EMPTY_LABEL };
  }
  if (dimension === "antiguedad") {
    const label = String(row.antiguedad ?? AGING_BUCKETS[0]);
    return { key: String(AGING_BUCKETS.indexOf(label as never)), label };
  }
  if (dimension === "dia_semana") {
    const label = row.fecha ? weekdayOf(String(row.fecha)) : EMPTY_LABEL;
    return { key: String(weekdayOrder(label)), label };
  }
  const raw = row[dimension];
  const label =
    raw === null || raw === undefined || String(raw).trim() === ""
      ? EMPTY_LABEL
      : String(raw);
  return { key: label, label };
}

/** Filtros: coincide si el valor contiene lo buscado (sin importar mayúsculas ni acentos). */
export function applyFilters(
  rows: FactRow[],
  filters: ReportFilter[],
  dataset: Dataset,
  grain: ReportSpec["grain"]
): FactRow[] {
  if (!filters.length) {
    return rows;
  }
  const wanted = filters.map((f) => ({
    dimension: f.dimension,
    values: f.values.map(normalize).filter(Boolean),
  }));
  return rows.filter((row) =>
    wanted.every(({ dimension, values }) => {
      const value = normalize(
        dimensionValue(row, dimension, dataset, grain).label
      );
      return values.some((w) => value === w || value.includes(w));
    })
  );
}

/** Valores posibles de cada dimensión de texto, para elegir filtros. */
export function filterOptions(
  rows: FactRow[],
  dataset: Dataset,
  maxPerDimension = 300
): Record<string, string[]> {
  const options: Record<string, string[]> = {};
  for (const dim of dataset.dimensions) {
    if (dim.type === "date") {
      continue;
    }
    const counts = new Map<string, number>();
    for (const row of rows) {
      const { label } = dimensionValue(row, dim.key, dataset, "dia");
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    options[dim.key] = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxPerDimension)
      .map(([label]) => label)
      .sort((a, b) => a.localeCompare(b, "es"));
  }
  return options;
}

/* ============ Agrupar ============ */

type Group = {
  key: string;
  label: string;
  accs: Acc[];
  rows: FactRow[];
};

function measureList(dataset: Dataset, spec: ReportSpec) {
  return spec.measures
    .map((key) => dataset.measures.find((m) => m.key === key))
    .filter((m): m is Dataset["measures"][number] => Boolean(m));
}

function finish(
  accs: Acc[],
  measures: ReturnType<typeof measureList>
): Record<string, number> {
  const values: Record<string, number> = {};
  measures.forEach((m, i) => {
    values[m.key] = accValue(accs[i], m.agg);
  });
  return values;
}

function aggregateRows(
  rows: FactRow[],
  measures: ReturnType<typeof measureList>
) {
  const accs = measures.map(newAcc);
  for (const row of rows) {
    for (const [i, m] of measures.entries()) {
      addTo(accs[i], m.agg, row);
    }
  }
  return finish(accs, measures);
}

function isChronological(dataset: Dataset, dimension: string | null): boolean {
  if (!dimension) {
    return false;
  }
  return (
    dimension === "dia_semana" ||
    dataset.dimensions.some((d) => d.key === dimension && d.type === "date") ||
    dimension === "mes_alta" ||
    dimension === "mes_vencimiento" ||
    dimension === "antiguedad"
  );
}

function sortGroups(
  rows: ReportRow[],
  spec: ReportSpec,
  chronological: boolean
): ReportRow[] {
  const sort =
    spec.sort ??
    (chronological
      ? { by: "label", dir: "asc" as const }
      : { by: spec.measures[0], dir: "desc" as const });
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (sort.by === "label") {
      const left = chronological ? a.key : a.label;
      const right = chronological ? b.key : b.label;
      return sign * left.localeCompare(right, "es", { numeric: true });
    }
    return sign * ((a.values[sort.by] ?? 0) - (b.values[sort.by] ?? 0));
  });
}

function splitSeries(
  rows: FactRow[],
  dataset: Dataset,
  spec: ReportSpec,
  primary: ReturnType<typeof measureList>[number]
): string[] {
  if (!spec.splitBy) {
    return [];
  }
  const groups = new Map<string, FactRow[]>();
  for (const row of rows) {
    const { label } = dimensionValue(row, spec.splitBy, dataset, spec.grain);
    const list = groups.get(label) ?? [];
    list.push(row);
    groups.set(label, list);
  }
  const ranked = [...groups.entries()]
    .map(([label, list]) => ({
      label,
      value: aggregateRows(list, [primary])[primary.key] ?? 0,
    }))
    .sort((a, b) => b.value - a.value)
    .map((s) => s.label);
  if (ranked.length <= MAX_SERIES) {
    return isChronological(dataset, spec.splitBy) ? ranked.sort() : ranked;
  }
  return [...ranked.slice(0, MAX_SERIES - 1), REST_LABEL];
}

function splitValues(
  group: Group,
  ctx: {
    dataset: Dataset;
    spec: ReportSpec;
    series: string[];
    primary: ReturnType<typeof measureList>[number];
  }
): Record<string, number> | undefined {
  const { dataset, spec, series, primary } = ctx;
  if (!(spec.splitBy && series.length)) {
    return;
  }
  const known = new Set(series);
  const buckets = new Map<string, FactRow[]>();
  for (const row of group.rows) {
    const { label } = dimensionValue(row, spec.splitBy, dataset, spec.grain);
    const bucket = known.has(label) ? label : REST_LABEL;
    const list = buckets.get(bucket) ?? [];
    list.push(row);
    buckets.set(bucket, list);
  }
  const values: Record<string, number> = {};
  for (const name of series) {
    const list = buckets.get(name);
    values[name] = list
      ? (aggregateRows(list, [primary])[primary.key] ?? 0)
      : 0;
  }
  return values;
}

/** Agrupa las filas según la especificación (ya filtradas por período y filtros). */
export function aggregate(
  rows: FactRow[],
  dataset: Dataset,
  spec: ReportSpec
): Aggregated {
  const measures = measureList(dataset, spec);
  const totals = aggregateRows(rows, measures);
  if (!spec.groupBy) {
    return {
      rows: [{ key: "total", label: "Total", values: totals }],
      totals,
      series: [],
      groupCount: 1,
    };
  }

  const groups = new Map<string, Group>();
  for (const row of rows) {
    const { key, label } = dimensionValue(
      row,
      spec.groupBy,
      dataset,
      spec.grain
    );
    let group = groups.get(key);
    if (!group) {
      group = { key, label, accs: measures.map(newAcc), rows: [] };
      groups.set(key, group);
    }
    for (const [i, m] of measures.entries()) {
      addTo(group.accs[i], m.agg, row);
    }
    group.rows.push(row);
  }

  const chronological = isChronological(dataset, spec.groupBy);
  let result = sortGroups(
    [...groups.values()].map((g) => ({
      key: g.key,
      label: g.label,
      values: finish(g.accs, measures),
    })),
    spec,
    chronological
  );
  const groupCount = result.length;

  if (spec.limit && result.length > spec.limit) {
    const kept = result.slice(0, spec.limit);
    const keptKeys = new Set(kept.map((r) => r.key));
    const restRows = [...groups.values()]
      .filter((g) => !keptKeys.has(g.key))
      .flatMap((g) => g.rows);
    result = [
      ...kept,
      {
        key: REST_KEY,
        label: `${REST_LABEL} (${groupCount - spec.limit})`,
        values: aggregateRows(restRows, measures),
      },
    ];
    groups.set(REST_KEY, {
      key: REST_KEY,
      label: REST_LABEL,
      accs: [],
      rows: restRows,
    });
  }

  const primary = measures[0];
  const series = primary ? splitSeries(rows, dataset, spec, primary) : [];
  if (primary && series.length) {
    result = result.map((row) => {
      const group = groups.get(row.key);
      return group
        ? {
            ...row,
            split: splitValues(group, { dataset, spec, series, primary }),
          }
        : row;
    });
  }

  return { rows: result, totals, series, groupCount };
}

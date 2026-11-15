/**
 * Generador de reportes · explorar un resultado (puro).
 *
 * Lo destacado de un reporte (quién lidera, quién más creció o cayó) y cómo
 * profundizar en una barra: filtrar por ese valor y abrirlo por otra cosa.
 */
import { REST_KEY, type ReportRow } from "./aggregate";
import type { Dataset, ReportSpec } from "./catalog";
import { bucketRange, finerGrain } from "./periods";

export type Highlight = {
  key: string;
  label: string;
  value: number;
  /** Parte del total (0 a 1) o null si la métrica no se suma. */
  share: number | null;
  /** Variación contra el período anterior, en %. */
  change: number | null;
};

export type Highlights = {
  leader: Highlight | null;
  riser: Highlight | null;
  faller: Highlight | null;
};

type HighlightInput = {
  rows: ReportRow[];
  measureKey: string;
  total: number;
  additive: boolean;
  previousByKey: Record<string, Record<string, number>> | null;
};

/** Movimientos menores a esto no se destacan como suba o baja. */
const MIN_CHANGE = 5;

function highlightOf(row: ReportRow, input: HighlightInput): Highlight {
  const value = row.values[input.measureKey] ?? 0;
  const before = input.previousByKey?.[row.key]?.[input.measureKey];
  return {
    key: row.key,
    label: row.label,
    value,
    share: input.additive && input.total ? value / input.total : null,
    change:
      before === undefined || before === 0
        ? null
        : ((value - before) / Math.abs(before)) * 100,
  };
}

export function highlights(input: HighlightInput): Highlights {
  const rows = input.rows
    .filter((r) => r.key !== REST_KEY)
    .map((r) => highlightOf(r, input));
  if (rows.length < 2) {
    return { leader: null, riser: null, faller: null };
  }
  const byValue = [...rows].sort((a, b) => b.value - a.value);
  const withChange = rows.filter(
    (r): r is Highlight & { change: number } => r.change !== null
  );
  const byChange = [...withChange].sort((a, b) => b.change - a.change);
  const riser = byChange[0];
  const faller = byChange.at(-1);
  return {
    leader: byValue[0] ?? null,
    riser: riser && riser.change >= MIN_CHANGE ? riser : null,
    faller: faller && faller.change <= -MIN_CHANGE ? faller : null,
  };
}

/** Qué dimensiones conviene ofrecer para abrir un valor. */
export function drillOptions(
  dataset: Dataset,
  spec: ReportSpec
): Dataset["dimensions"] {
  const filtered = new Set(spec.filters.map((f) => f.dimension));
  return dataset.dimensions.filter(
    (d) =>
      d.key !== spec.groupBy && !filtered.has(d.key) && d.key !== "dia_semana"
  );
}

export function isDateDimension(dataset: Dataset, key: string | null): boolean {
  return dataset.dimensions.some((d) => d.key === key && d.type === "date");
}

/**
 * Profundizar en un grupo: si es una fecha, el período pasa a ser ese grupo;
 * si no, se filtra por ese valor. Después se abre por `nextGroupBy`.
 */
export function drillSpec(
  dataset: Dataset,
  spec: ReportSpec,
  row: Pick<ReportRow, "key" | "label">,
  nextGroupBy: string
): ReportSpec | null {
  if (row.key === REST_KEY || !spec.groupBy) {
    return null;
  }
  const nextIsDate = isDateDimension(dataset, nextGroupBy);
  const base: ReportSpec = {
    ...spec,
    groupBy: nextGroupBy,
    splitBy: spec.splitBy === nextGroupBy ? null : spec.splitBy,
    sort: null,
    limit: nextIsDate ? null : (spec.limit ?? 20),
    chart: nextIsDate ? "line" : "bar",
    title: null,
  };
  if (isDateDimension(dataset, spec.groupBy)) {
    const range = bucketRange(row.key, spec.grain);
    if (!range) {
      return null;
    }
    return {
      ...base,
      period: "personalizado",
      from: range.from,
      to: range.to,
      grain: finerGrain(spec.grain),
    };
  }
  return {
    ...base,
    grain: nextIsDate ? "mes" : spec.grain,
    filters: [
      ...spec.filters.filter((f) => f.dimension !== spec.groupBy),
      { dimension: spec.groupBy, values: [row.label] },
    ],
  };
}

/** Serie corta para dibujar una mini línea (solo si el reporte va por fecha). */
export function sparkline(rows: ReportRow[], measureKey: string): number[] {
  return rows
    .filter((r) => r.key !== REST_KEY)
    .map((r) => r.values[measureKey] ?? 0);
}

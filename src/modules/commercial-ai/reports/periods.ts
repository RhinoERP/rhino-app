/**
 * Generador de reportes · fechas (puro). Todo en fechas ISO "AAAA-MM-DD".
 */
import type { Grain, PeriodPreset, ReportSpec } from "./catalog";

const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;
const MONTHS_IN_QUARTER = 3;

export type DateRange = { from: string; to: string };

function toDate(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return toIso(new Date(toDate(iso).getTime() + days * DAY_MS));
}

function daysBetween(from: string, to: string): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / DAY_MS);
}

function monthStart(iso: string, offset = 0): string {
  const d = toDate(iso);
  return toIso(
    new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1, 12))
  );
}

function monthEnd(iso: string, offset = 0): string {
  return addDays(monthStart(iso, offset + 1), -1);
}

function quarterStart(iso: string, offset = 0): string {
  const d = toDate(iso);
  const month =
    Math.floor(d.getUTCMonth() / MONTHS_IN_QUARTER) * MONTHS_IN_QUARTER +
    offset * MONTHS_IN_QUARTER;
  return toIso(new Date(Date.UTC(d.getUTCFullYear(), month, 1, 12)));
}

/** Lunes de la semana. */
function weekStart(iso: string): string {
  const day = toDate(iso).getUTCDay();
  return addDays(iso, -((day + WEEK_DAYS - 1) % WEEK_DAYS));
}

export function shiftMonths(iso: string, months: number): string {
  const d = toDate(iso);
  const target = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, 12)
  );
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12)
  ).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return toIso(target);
}

const PRESET_RANGES: Record<
  Exclude<PeriodPreset, "personalizado">,
  (today: string) => DateRange
> = {
  hoy: (t) => ({ from: t, to: t }),
  ayer: (t) => ({ from: addDays(t, -1), to: addDays(t, -1) }),
  esta_semana: (t) => ({ from: weekStart(t), to: t }),
  semana_pasada: (t) => ({
    from: addDays(weekStart(t), -WEEK_DAYS),
    to: addDays(weekStart(t), -1),
  }),
  este_mes: (t) => ({ from: monthStart(t), to: t }),
  mes_pasado: (t) => ({ from: monthStart(t, -1), to: monthEnd(t, -1) }),
  ultimos_30: (t) => ({ from: addDays(t, -29), to: t }),
  ultimos_90: (t) => ({ from: addDays(t, -89), to: t }),
  este_trimestre: (t) => ({ from: quarterStart(t), to: t }),
  trimestre_pasado: (t) => ({
    from: quarterStart(t, -1),
    to: addDays(quarterStart(t), -1),
  }),
  este_anio: (t) => ({ from: `${t.slice(0, 4)}-01-01`, to: t }),
  anio_pasado: (t) => {
    const year = Number(t.slice(0, 4)) - 1;
    return { from: `${year}-01-01`, to: `${year}-12-31` };
  },
  ultimos_12_meses: (t) => ({ from: monthStart(t, -11), to: t }),
};

export function resolveRange(
  spec: Pick<ReportSpec, "period" | "from" | "to">,
  today: string
): DateRange {
  if (spec.period === "personalizado" && spec.from && spec.to) {
    return spec.from <= spec.to
      ? { from: spec.from, to: spec.to }
      : { from: spec.to, to: spec.from };
  }
  const preset = spec.period === "personalizado" ? "este_mes" : spec.period;
  return PRESET_RANGES[preset](today);
}

const MONTH_BASED = new Set<PeriodPreset>(["este_mes", "mes_pasado"]);
const QUARTER_BASED = new Set<PeriodPreset>([
  "este_trimestre",
  "trimestre_pasado",
]);
const YEAR_BASED = new Set<PeriodPreset>([
  "este_anio",
  "anio_pasado",
  "ultimos_12_meses",
]);

/** El período anterior equivalente para comparar (mes contra mes, año contra año…). */
export function previousRange(
  range: DateRange,
  preset: PeriodPreset
): DateRange {
  if (MONTH_BASED.has(preset)) {
    return { from: shiftMonths(range.from, -1), to: shiftMonths(range.to, -1) };
  }
  if (QUARTER_BASED.has(preset)) {
    return {
      from: shiftMonths(range.from, -MONTHS_IN_QUARTER),
      to: shiftMonths(range.to, -MONTHS_IN_QUARTER),
    };
  }
  if (YEAR_BASED.has(preset)) {
    return {
      from: shiftMonths(range.from, -12),
      to: shiftMonths(range.to, -12),
    };
  }
  const length = daysBetween(range.from, range.to) + 1;
  return { from: addDays(range.from, -length), to: addDays(range.from, -1) };
}

const MONTHS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];
const WEEKDAYS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

/** Clave ordenable y etiqueta del grupo de fecha. */
export function dateBucket(
  iso: string,
  grain: Grain
): { key: string; label: string } {
  const year = iso.slice(0, 4);
  const month = Number(iso.slice(5, 7));
  if (grain === "anio") {
    return { key: year, label: year };
  }
  if (grain === "trimestre") {
    const q = Math.ceil(month / MONTHS_IN_QUARTER);
    return { key: `${year}-T${q}`, label: `${q}º trim ${year}` };
  }
  if (grain === "mes") {
    return { key: iso.slice(0, 7), label: `${MONTHS[month - 1]} ${year}` };
  }
  if (grain === "semana") {
    const start = weekStart(iso);
    return {
      key: start,
      label: `Sem. ${Number(start.slice(8, 10))} ${MONTHS[Number(start.slice(5, 7)) - 1]}`,
    };
  }
  return {
    key: iso,
    label: `${Number(iso.slice(8, 10))} ${MONTHS[month - 1]}${year === String(new Date().getFullYear()) ? "" : ` ${year}`}`,
  };
}

export function weekdayOf(iso: string): string {
  return WEEKDAYS[toDate(iso).getUTCDay()] ?? "";
}

export function weekdayOrder(label: string): number {
  const index = WEEKDAYS.indexOf(label);
  // Lunes primero.
  return index === 0 ? WEEK_DAYS : index;
}

export function formatRange(range: DateRange): string {
  const fmt = (iso: string) =>
    `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}/${iso.slice(0, 4)}`;
  return range.from === range.to
    ? fmt(range.from)
    : `${fmt(range.from)} al ${fmt(range.to)}`;
}

/** Grano sugerido para que un gráfico por fecha no quede ni vacío ni amontonado. */
export function suggestedGrain(range: DateRange): Grain {
  const days = daysBetween(range.from, range.to) + 1;
  if (days <= 45) {
    return "dia";
  }
  if (days <= 120) {
    return "semana";
  }
  if (days <= 800) {
    return "mes";
  }
  return "trimestre";
}

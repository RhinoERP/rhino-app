import {
  delta,
  formatDelta,
  formatValue,
} from "@/components/commercial-ai/reports/report-format";
import { REST_KEY } from "./aggregate";
import type { ReportResult } from "./run-report";

/* ============ Programación ============ */

export const REPORT_FREQUENCIES = ["diario", "semanal", "mensual"] as const;
export type ReportFrequency = (typeof REPORT_FREQUENCIES)[number];

export type ReportSchedule = {
  frequency: ReportFrequency;
  /** 0 = domingo … 6 = sábado (solo semanal). */
  weekday: number;
  /** 1 a 28 (solo mensual). */
  monthday: number;
  /** Hora argentina, 0 a 23. */
  hour: number;
  active: boolean;
};

export const WEEKDAYS = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
];

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** Valida lo que llega del formulario o de la base. */
export function sanitizeSchedule(input: unknown): ReportSchedule | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const raw = input as Record<string, unknown>;
  const frequency = REPORT_FREQUENCIES.find((f) => f === raw.frequency);
  if (!frequency) {
    return null;
  }
  return {
    frequency,
    weekday: clamp(raw.weekday, 0, 6, 1),
    monthday: clamp(raw.monthday, 1, 28, 1),
    hour: clamp(raw.hour, 0, 23, 8),
    active: raw.active !== false,
  };
}

/** "Todos los lunes a las 8 h". */
export function describeSchedule(schedule: ReportSchedule): string {
  const at = `a las ${schedule.hour} h`;
  if (schedule.frequency === "diario") {
    return `Todos los días ${at}`;
  }
  if (schedule.frequency === "semanal") {
    return `Todos los ${WEEKDAYS[schedule.weekday]} ${at}`;
  }
  return `El día ${schedule.monthday} de cada mes ${at}`;
}

export type ArgentinaClock = {
  /** AAAA-MM-DD */
  date: string;
  hour: number;
  weekday: number;
  monthday: number;
};

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function argentinaClock(now: Date): ArgentinaClock {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    weekday: WEEKDAY_INDEX[parts.weekday as string] ?? 0,
    monthday: Number(parts.day),
  };
}

const RESEND_GUARD_MS = 20 * 60 * 60 * 1000;

/** ¿Toca mandarlo en esta hora? (no repite si ya salió en las últimas 20 h) */
export function isScheduleDue(
  schedule: ReportSchedule,
  clock: ArgentinaClock,
  lastSentAt: string | null,
  now: Date
): boolean {
  if (!schedule.active || clock.hour !== schedule.hour) {
    return false;
  }
  if (
    lastSentAt &&
    now.getTime() - new Date(lastSentAt).getTime() < RESEND_GUARD_MS
  ) {
    return false;
  }
  if (schedule.frequency === "semanal") {
    return clock.weekday === schedule.weekday;
  }
  if (schedule.frequency === "mensual") {
    return clock.monthday === schedule.monthday;
  }
  return true;
}

/* ============ Texto del mensaje ============ */

const TOP_ROWS = 8;
const LABEL_MAX = 40;

function arrow(change: number | null, inverse: boolean): string {
  if (change === null || Math.abs(change) < 0.5) {
    return "";
  }
  const good = inverse ? change < 0 : change > 0;
  return ` ${good ? "🟢" : "🔴"} ${formatDelta(change)}`;
}

function shortLabel(label: string): string {
  return label.length > LABEL_MAX ? `${label.slice(0, LABEL_MAX - 1)}…` : label;
}

/** Métricas donde bajar es bueno (deuda, gastos, días de atraso). */
const INVERSE = /deuda|vencid|gasto|atraso|dias|días|nota/i;

/**
 * El reporte en texto de WhatsApp: totales con la variación contra el período
 * anterior, el ranking principal y el link para abrirlo en la app.
 */
export function reportToWhatsApp(
  report: ReportResult,
  link: string | null
): string {
  const lines = [`📊 *${report.title}*`];
  if (report.periodLabel) {
    lines.push(`_${report.periodLabel}_`);
  }
  lines.push("");
  for (const m of report.measures) {
    const total = report.totals[m.key] ?? 0;
    const change = report.previousTotals
      ? delta(total, report.previousTotals[m.key])
      : null;
    lines.push(
      `• ${m.label}: *${formatValue(total, m.format)}*${arrow(change, INVERSE.test(m.label))}`
    );
  }
  if (report.previousTotals) {
    lines.push("_vs. el período anterior_");
  }

  const main = report.measures[0];
  const rows = report.rows.filter((r) => r.key !== REST_KEY);
  if (main && report.groupLabel && rows.length) {
    lines.push("", `*Por ${report.groupLabel.toLowerCase()}*`);
    const byValue = report.groupLabel.toLowerCase().includes("fecha")
      ? rows
      : [...rows].sort(
          (a, b) => (b.values[main.key] ?? 0) - (a.values[main.key] ?? 0)
        );
    byValue.slice(0, TOP_ROWS).forEach((row, i) => {
      lines.push(
        `${i + 1}. ${shortLabel(row.label)} · ${formatValue(row.values[main.key] ?? 0, main.format)}`
      );
    });
    const more = report.groupCount - Math.min(TOP_ROWS, rows.length);
    if (more > 0) {
      lines.push(`_y ${more} más_`);
    }
  }
  if (!report.factCount) {
    lines.push("", "No hubo movimientos en el período.");
  }
  if (link) {
    lines.push("", `Abrilo en RhinosApp: ${link}`);
  }
  return lines.join("\n");
}

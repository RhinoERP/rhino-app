"use client";

import {
  ArrowRightIcon,
  CrownSimpleIcon,
  TrendDownIcon,
  TrendUpIcon,
  XIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Dataset } from "@/modules/commercial-ai/reports/catalog";
import {
  drillOptions,
  type Highlight,
  highlights,
} from "@/modules/commercial-ai/reports/explore";
import type { ReportResult } from "@/modules/commercial-ai/reports/run-report";
import {
  formatDelta,
  formatShort,
  formatValue,
  SERIES_COLORS,
} from "./report-format";
import { DeltaBadge, INVERSE } from "./report-view";

/* ============ Lo destacado ============ */

const GOOD_TONE = "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
const BAD_TONE = "bg-red-500/10 text-red-700 dark:text-red-400";

function leaderText(
  leader: Highlight | null,
  measure: ReportResult["measures"][number]
): string {
  if (leader?.share) {
    return `concentra el ${Math.round(leader.share * 100)}% de ${measure.label.toLowerCase()}`;
  }
  return `encabeza con ${formatShort(leader?.value ?? 0, measure.format)}`;
}

function HighlightChip({
  highlight,
  icon: Icon,
  tone,
  text,
  onSelect,
}: {
  highlight: Highlight;
  icon: typeof CrownSimpleIcon;
  tone: string;
  text: string;
  onSelect: (key: string) => void;
}) {
  return (
    <button
      className="group flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => onSelect(highlight.key)}
      type="button"
    >
      <span className={cn("rounded-md p-1", tone)}>
        <Icon className="size-3.5" weight="fill" />
      </span>
      <span className="min-w-0 truncate">
        <b className="font-medium group-hover:underline">{highlight.label}</b>{" "}
        <span className="text-muted-foreground">{text}</span>
      </span>
    </button>
  );
}

export function ReportHighlights({
  report,
  measureKey,
  onSelect,
}: {
  report: ReportResult;
  measureKey: string;
  onSelect: (key: string) => void;
}) {
  const measure = report.measures.find((m) => m.key === measureKey);
  if (!(measure && report.spec.groupBy)) {
    return null;
  }
  const found = highlights({
    rows: report.rows,
    measureKey,
    total: report.totals[measureKey] ?? 0,
    additive: measure.additive,
    previousByKey: report.previousByKey,
  });
  const inverse = INVERSE.has(measureKey);
  const chips = [
    found.leader && {
      highlight: found.leader,
      icon: CrownSimpleIcon,
      text: leaderText(found.leader, measure),
      tone: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    },
    found.riser && {
      highlight: found.riser,
      icon: TrendUpIcon,
      text: `es lo que más ${inverse ? "empeoró" : "creció"}: ${formatDelta(found.riser.change)}`,
      tone: inverse ? BAD_TONE : GOOD_TONE,
    },
    found.faller && {
      highlight: found.faller,
      icon: TrendDownIcon,
      text: `es lo que más ${inverse ? "mejoró" : "cayó"}: ${formatDelta(found.faller.change)}`,
      tone: inverse ? GOOD_TONE : BAD_TONE,
    },
  ].filter((chip) => Boolean(chip)) as {
    highlight: Highlight;
    icon: typeof CrownSimpleIcon;
    text: string;
    tone: string;
  }[];
  return (
    <div className="flex flex-wrap gap-x-1 gap-y-0.5">
      {chips.map((chip) => (
        <HighlightChip
          highlight={chip.highlight}
          icon={chip.icon}
          key={chip.text}
          onSelect={onSelect}
          text={chip.text}
          tone={chip.tone}
        />
      ))}
    </div>
  );
}

/* ============ Ficha del valor elegido ============ */

export function FocusPanel({
  report,
  dataset,
  rowKey,
  onClose,
  onDrill,
}: {
  report: ReportResult;
  dataset: Dataset;
  rowKey: string;
  onClose: () => void;
  onDrill: (dimension: string) => void;
}) {
  const row = report.rows.find((r) => r.key === rowKey);
  if (!row) {
    return null;
  }
  const previous = report.previousByKey?.[row.key];
  const options = drillOptions(dataset, report.spec);
  return (
    <aside
      aria-label={`Detalle de ${row.label}`}
      className="motion-safe:fade-in-0 motion-safe:slide-in-from-right-4 flex h-full flex-col gap-4 rounded-xl border bg-card p-4 motion-safe:animate-in"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground text-xs">{report.groupLabel}</p>
          <h3 className="font-heading text-lg leading-snug">{row.label}</h3>
        </div>
        <Button
          aria-label="Cerrar detalle"
          className="size-7"
          onClick={onClose}
          size="icon"
          variant="ghost"
        >
          <XIcon />
        </Button>
      </div>

      <dl className="space-y-3">
        {report.measures.map((m, i) => {
          const value = row.values[m.key] ?? 0;
          const total = report.totals[m.key] ?? 0;
          const before = previous?.[m.key];
          const part = m.additive && total ? value / total : null;
          return (
            <div key={m.key}>
              <dt className="flex items-center gap-1.5 text-muted-foreground text-xs">
                <span
                  className="size-2 rounded-full"
                  style={{
                    background: SERIES_COLORS[i % SERIES_COLORS.length],
                  }}
                />
                {m.label}
              </dt>
              <dd className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
                <span className="font-heading text-xl tabular-nums">
                  {formatValue(value, m.format)}
                </span>
                {before === undefined ? null : (
                  <DeltaBadge
                    inverse={INVERSE.has(m.key)}
                    value={
                      before
                        ? ((value - before) / Math.abs(before)) * 100
                        : null
                    }
                  />
                )}
              </dd>
              {part === null ? null : (
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${Math.min(part * 100, 100)}%`,
                        background: SERIES_COLORS[i % SERIES_COLORS.length],
                      }}
                    />
                  </span>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {Math.round(part * 1000) / 10}% del total
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </dl>

      {options.length ? (
        <div className="mt-auto space-y-2 border-t pt-3">
          <p className="font-medium text-sm">Ver {row.label} abierto por</p>
          <div className="flex flex-wrap gap-1.5">
            {options.map((d) => (
              <button
                className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors hover:border-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                key={d.key}
                onClick={() => onDrill(d.key)}
                type="button"
              >
                {d.type === "date" ? "Fecha (evolución)" : d.label}
                <ArrowRightIcon className="size-3" />
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </aside>
  );
}

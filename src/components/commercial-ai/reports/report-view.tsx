"use client";

import {
  ArrowDownIcon,
  ArrowsDownUpIcon,
  ArrowUpIcon,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { REST_KEY } from "@/modules/commercial-ai/reports/aggregate";
import type { MeasureFormat } from "@/modules/commercial-ai/reports/catalog";
import type {
  ReportColumn,
  ReportResult,
} from "@/modules/commercial-ai/reports/run-report";
import {
  delta,
  formatDelta,
  formatShort,
  formatValue,
  SERIES_COLORS,
} from "./report-format";

/* ============ Números grandes ============ */

function DeltaBadge({
  value,
  inverse,
}: {
  value: number | null;
  inverse?: boolean;
}) {
  if (value === null) {
    return null;
  }
  const good = inverse ? value < 0 : value > 0;
  const Arrow = value >= 0 ? ArrowUpIcon : ArrowDownIcon;
  let tone = good
    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
    : "bg-red-500/10 text-red-700 dark:text-red-400";
  if (Math.abs(value) < 0.05) {
    tone = "bg-muted text-muted-foreground";
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium text-xs tabular-nums",
        tone
      )}
    >
      <Arrow className="size-3" weight="bold" />
      {formatDelta(value)}
    </span>
  );
}

/** Métricas donde subir es malo (deuda, gastos…). */
const INVERSE = new Set([
  "vencido",
  "porc_vencido",
  "saldo",
  "sin_stock",
  "bajo_minimo",
  "descuentos",
  "monto",
]);

export function ReportKpis({ report }: { report: ReportResult }) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
      {report.measures.map((m) => {
        const current = report.totals[m.key] ?? 0;
        const previous = report.previousTotals?.[m.key];
        return (
          <div className="rounded-xl border bg-card p-3" key={m.key}>
            <p className="truncate text-muted-foreground text-xs">{m.label}</p>
            <p className="mt-1 font-heading text-xl tabular-nums md:text-2xl">
              {formatValue(current, m.format)}
            </p>
            {report.previousTotals ? (
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
                <DeltaBadge
                  inverse={INVERSE.has(m.key)}
                  value={delta(current, previous)}
                />
                <span>antes {formatShort(previous ?? 0, m.format)}</span>
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/* ============ Gráfico ============ */

type ChartDatum = Record<string, string | number>;

function ChartTooltip({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
  format: MeasureFormat;
}) {
  if (!(active && payload?.length)) {
    return null;
  }
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-popover-foreground text-xs shadow-md">
      <p className="mb-1 font-medium">{label}</p>
      {payload.map((p) => (
        <p className="flex items-center gap-2 tabular-nums" key={p.name}>
          <span
            className="size-2 rounded-full"
            style={{ background: p.color }}
          />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto font-medium">
            {formatValue(Number(p.value), format)}
          </span>
        </p>
      ))}
    </div>
  );
}

const AXIS = { fontSize: 11, fill: "var(--muted-foreground)" };
const MAX_PIE_SLICES = 8;
const ROW_HEIGHT = 30;

function isDateGroup(report: ReportResult): boolean {
  return (
    report.spec.groupBy === "fecha" ||
    report.spec.groupBy === "mes_alta" ||
    report.spec.groupBy === "mes_vencimiento"
  );
}

function pieData(data: ChartDatum[], key: string): ChartDatum[] {
  const sorted = [...data].sort((a, b) => Number(b[key]) - Number(a[key]));
  if (sorted.length <= MAX_PIE_SLICES) {
    return sorted;
  }
  const rest = sorted
    .slice(MAX_PIE_SLICES - 1)
    .reduce((acc, d) => acc + Number(d[key]), 0);
  return [
    ...sorted.slice(0, MAX_PIE_SLICES - 1),
    { label: "Otros", [key]: rest },
  ];
}

type ChartSetup = {
  chart: ReportResult["spec"]["chart"];
  data: ChartDatum[];
  format: MeasureFormat;
  horizontal: boolean;
  stacked: boolean;
  keys: string[];
  names: Record<string, string>;
};

const color = (i: number) => SERIES_COLORS[i % SERIES_COLORS.length];
const MARGIN = { left: 4, right: 12, top: 8 };

function chartChrome(setup: ChartSetup) {
  return [
    <Tooltip
      content={<ChartTooltip format={setup.format} />}
      cursor={{ fill: "var(--muted)", opacity: 0.4 }}
      key="tooltip"
    />,
    setup.stacked ? (
      <Legend iconSize={8} key="legend" wrapperStyle={{ fontSize: 12 }} />
    ) : null,
  ];
}

function timeAxes(setup: ChartSetup) {
  return [
    <CartesianGrid
      key="grid"
      stroke="var(--border)"
      strokeDasharray="3 3"
      vertical={false}
    />,
    <XAxis
      dataKey="label"
      key="x"
      minTickGap={16}
      tick={AXIS}
      tickLine={false}
    />,
    <YAxis
      key="y"
      tick={AXIS}
      tickFormatter={(v: number) => formatShort(v, setup.format)}
      tickLine={false}
      width={64}
    />,
  ];
}

function renderPie(setup: ChartSetup) {
  const slices = pieData(setup.data, setup.keys[0]);
  return (
    <PieChart>
      <Pie
        data={slices}
        dataKey={setup.keys[0]}
        innerRadius="55%"
        label={({ name, percent }) =>
          `${String(name).slice(0, 18)} ${Math.round((percent ?? 0) * 100)}%`
        }
        labelLine={false}
        nameKey="label"
        outerRadius="85%"
        paddingAngle={1}
      >
        {slices.map((d, i) => (
          <Cell fill={color(i)} key={String(d.label)} />
        ))}
      </Pie>
      {chartChrome(setup)}
    </PieChart>
  );
}

function renderLine(setup: ChartSetup) {
  return (
    <LineChart data={setup.data} margin={MARGIN}>
      {timeAxes(setup)}
      {chartChrome(setup)}
      {setup.keys.map((k, i) => (
        <Line
          dataKey={k}
          dot={setup.data.length <= 31}
          key={k}
          name={setup.names[k]}
          stroke={color(i)}
          strokeWidth={2}
          type="monotone"
        />
      ))}
    </LineChart>
  );
}

function renderArea(setup: ChartSetup) {
  return (
    <AreaChart data={setup.data} margin={MARGIN}>
      {timeAxes(setup)}
      {chartChrome(setup)}
      {setup.keys.map((k, i) => (
        <Area
          dataKey={k}
          fill={color(i)}
          fillOpacity={0.25}
          key={k}
          name={setup.names[k]}
          stackId={setup.stacked ? "s" : undefined}
          stroke={color(i)}
          type="monotone"
        />
      ))}
    </AreaChart>
  );
}

function barRadius(
  setup: ChartSetup
): number | [number, number, number, number] {
  if (setup.stacked) {
    return 0;
  }
  return setup.horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0];
}

const shortLabel = (v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v);

function renderBar(setup: ChartSetup) {
  const { horizontal } = setup;
  const valueTick = (v: number) => formatShort(v, setup.format);
  return (
    <BarChart
      data={setup.data}
      layout={horizontal ? "vertical" : "horizontal"}
      margin={{ ...MARGIN, right: 16 }}
    >
      <CartesianGrid
        horizontal={!horizontal}
        stroke="var(--border)"
        strokeDasharray="3 3"
        vertical={horizontal}
      />
      {horizontal ? (
        <XAxis tick={AXIS} tickFormatter={valueTick} type="number" />
      ) : (
        <XAxis dataKey="label" minTickGap={8} tick={AXIS} tickLine={false} />
      )}
      {horizontal ? (
        <YAxis
          dataKey="label"
          interval={0}
          tick={AXIS}
          tickFormatter={shortLabel}
          tickLine={false}
          type="category"
          width={150}
        />
      ) : (
        <YAxis
          tick={AXIS}
          tickFormatter={valueTick}
          tickLine={false}
          width={64}
        />
      )}
      {chartChrome(setup)}
      {setup.keys.map((k, i) => (
        <Bar
          dataKey={k}
          fill={color(i)}
          key={k}
          maxBarSize={horizontal ? 22 : 48}
          name={setup.names[k]}
          radius={barRadius(setup)}
          stackId={setup.stacked ? "s" : undefined}
        />
      ))}
    </BarChart>
  );
}

function renderChart(setup: ChartSetup): React.ReactElement {
  if (setup.chart === "pie") {
    return renderPie(setup);
  }
  if (setup.chart === "line") {
    return renderLine(setup);
  }
  if (setup.chart === "area") {
    return renderArea(setup);
  }
  return renderBar(setup);
}

export function ReportChart({ report }: { report: ReportResult }) {
  const [measureKey, setMeasureKey] = useState(report.measures[0]?.key ?? "");
  const measure =
    report.measures.find((m) => m.key === measureKey) ?? report.measures[0];
  const series = report.series;
  const chart = report.spec.chart;

  const data = useMemo<ChartDatum[]>(
    () =>
      report.rows.map((row) => ({
        label: row.label,
        ...row.values,
        ...(row.split ?? {}),
      })),
    [report.rows]
  );

  if (!(measure && report.spec.groupBy) || chart === "table" || !data.length) {
    return null;
  }

  const format = series.length
    ? (report.measures[0]?.format ?? "number")
    : measure.format;
  const horizontal =
    chart === "bar" && !isDateGroup(report) && data.length <= 40;
  const height = horizontal
    ? Math.max(220, data.length * ROW_HEIGHT + 40)
    : 320;
  const body = renderChart({
    chart,
    data,
    format,
    horizontal,
    stacked: series.length > 0,
    keys: series.length ? series : [measure.key],
    names: series.length
      ? Object.fromEntries(series.map((s) => [s, s]))
      : { [measure.key]: measure.label },
  });

  return (
    <div className="rounded-xl border bg-card p-3">
      {!series.length && report.measures.length > 1 ? (
        <div className="mb-2 flex flex-wrap gap-1">
          {report.measures.map((m) => (
            <button
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                m.key === measure.key
                  ? "border-primary bg-primary/10 font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
              key={m.key}
              onClick={() => setMeasureKey(m.key)}
              type="button"
            >
              {m.label}
            </button>
          ))}
        </div>
      ) : null}
      {series.length ? (
        <p className="mb-2 text-muted-foreground text-xs">
          {report.measures[0]?.label} abierto por{" "}
          {report.splitLabel?.toLowerCase()}
        </p>
      ) : null}
      <div style={{ height }}>
        <ResponsiveContainer height="100%" width="100%">
          {body}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ============ Tabla ============ */

type SortState = { key: string; dir: "asc" | "desc" } | null;

function SortHeader({
  label,
  active,
  dir,
  onClick,
  align = "right",
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  align?: "left" | "right";
}) {
  let Icon = ArrowsDownUpIcon;
  if (active) {
    Icon = dir === "asc" ? ArrowUpIcon : ArrowDownIcon;
  }
  return (
    <th
      className={cn(
        "px-3 py-2 font-medium",
        align === "right" ? "text-right" : "text-left"
      )}
    >
      <button
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          active ? "text-foreground" : ""
        )}
        onClick={onClick}
        type="button"
      >
        {label}
        <Icon className="size-3" />
      </button>
    </th>
  );
}

function share(value: number, total: number): string {
  return total ? `${Math.round((value / total) * 1000) / 10}%` : "";
}

export function ReportTable({ report }: { report: ReportResult }) {
  const [sort, setSort] = useState<SortState>(null);
  const compare = Boolean(report.previousByKey);
  const primary: ReportColumn | undefined = report.measures[0];
  const showShare = Boolean(primary?.additive && report.spec.groupBy);

  const rows = useMemo(() => {
    if (!sort) {
      return report.rows;
    }
    const sign = sort.dir === "asc" ? 1 : -1;
    const fixed = report.rows.filter((r) => r.key === REST_KEY);
    const sorted = report.rows
      .filter((r) => r.key !== REST_KEY)
      .sort((a, b) =>
        sort.key === "label"
          ? sign * a.label.localeCompare(b.label, "es", { numeric: true })
          : sign *
            ((a.values[sort.key] ?? a.split?.[sort.key] ?? 0) -
              (b.values[sort.key] ?? b.split?.[sort.key] ?? 0))
      );
    return [...sorted, ...fixed];
  }, [report.rows, sort]);

  const toggle = (key: string) =>
    setSort((prev) =>
      prev?.key === key
        ? { key, dir: prev.dir === "desc" ? "asc" : "desc" }
        : { key, dir: key === "label" ? "asc" : "desc" }
    );

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="max-h-[560px] overflow-auto">
        <table className="w-full min-w-max text-sm">
          <thead className="sticky top-0 z-10 border-b bg-muted/80 text-muted-foreground text-xs backdrop-blur">
            <tr>
              <SortHeader
                active={sort?.key === "label"}
                align="left"
                dir={sort?.dir ?? "asc"}
                label={report.groupLabel ?? "Total"}
                onClick={() => toggle("label")}
              />
              {report.measures.map((m) => (
                <SortHeader
                  active={sort?.key === m.key}
                  dir={sort?.dir ?? "desc"}
                  key={m.key}
                  label={m.label}
                  onClick={() => toggle(m.key)}
                />
              ))}
              {compare ? (
                <th className="px-3 py-2 text-right font-medium">vs. antes</th>
              ) : null}
              {showShare ? (
                <th className="px-3 py-2 text-right font-medium">
                  % del total
                </th>
              ) : null}
              {report.series.map((s) => (
                <SortHeader
                  active={sort?.key === s}
                  dir={sort?.dir ?? "desc"}
                  key={s}
                  label={s}
                  onClick={() => toggle(s)}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const prev = report.previousByKey?.[row.key];
              const isRest = row.key === REST_KEY;
              return (
                <tr
                  className={cn(
                    "border-b last:border-0 hover:bg-muted/40",
                    isRest && "text-muted-foreground italic"
                  )}
                  key={row.key}
                >
                  <td
                    className="max-w-[280px] truncate px-3 py-2"
                    title={row.label}
                  >
                    {row.label}
                  </td>
                  {report.measures.map((m) => (
                    <td
                      className="px-3 py-2 text-right tabular-nums"
                      key={m.key}
                    >
                      {formatValue(row.values[m.key] ?? 0, m.format)}
                    </td>
                  ))}
                  {compare && primary ? (
                    <td className="px-3 py-2 text-right">
                      {isRest ? null : (
                        <DeltaBadge
                          inverse={INVERSE.has(primary.key)}
                          value={delta(
                            row.values[primary.key] ?? 0,
                            prev?.[primary.key]
                          )}
                        />
                      )}
                    </td>
                  ) : null}
                  {showShare && primary ? (
                    <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">
                      {share(
                        row.values[primary.key] ?? 0,
                        report.totals[primary.key] ?? 0
                      )}
                    </td>
                  ) : null}
                  {report.series.map((s) => (
                    <td className="px-3 py-2 text-right tabular-nums" key={s}>
                      {formatValue(
                        row.split?.[s] ?? 0,
                        primary?.format ?? "number"
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
          {report.spec.groupBy && report.rows.length > 1 ? (
            <tfoot className="sticky bottom-0 border-t bg-muted/80 font-medium backdrop-blur">
              <tr>
                <td className="px-3 py-2">Total</td>
                {report.measures.map((m) => (
                  <td className="px-3 py-2 text-right tabular-nums" key={m.key}>
                    {formatValue(report.totals[m.key] ?? 0, m.format)}
                  </td>
                ))}
                {compare && primary ? (
                  <td className="px-3 py-2 text-right">
                    <DeltaBadge
                      inverse={INVERSE.has(primary.key)}
                      value={delta(
                        report.totals[primary.key] ?? 0,
                        report.previousTotals?.[primary.key]
                      )}
                    />
                  </td>
                ) : null}
                {showShare ? (
                  <td className="px-3 py-2 text-right">100%</td>
                ) : null}
                {report.series.map((s) => (
                  <td className="px-3 py-2 text-right tabular-nums" key={s}>
                    {formatValue(
                      report.rows.reduce(
                        (acc, r) => acc + (r.split?.[s] ?? 0),
                        0
                      ),
                      primary?.format ?? "number"
                    )}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}

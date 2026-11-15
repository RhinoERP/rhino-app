"use client";

import {
  ArrowDownIcon,
  ArrowsDownUpIcon,
  ArrowUpIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { sparkline } from "@/modules/commercial-ai/reports/explore";
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

/* ============ Piezas chicas ============ */

/** Métricas donde subir es malo (deuda, gastos…). */
export const INVERSE = new Set([
  "vencido",
  "porc_vencido",
  "saldo",
  "sin_stock",
  "bajo_minimo",
  "descuentos",
  "monto",
]);

export function DeltaBadge({
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

const COUNT_MS = 650;

/** El número sube hasta su valor cuando cambia (sin animación si se pidió menos movimiento). */
function useCountUp(target: number): number {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const start = from.current;
    if (reduce || start === target) {
      setValue(target);
      from.current = target;
      return;
    }
    let frame = 0;
    const began = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - began) / COUNT_MS, 1);
      const eased = 1 - (1 - t) ** 3;
      setValue(start + (target - start) * eased);
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        from.current = target;
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return value;
}

const SPARK_W = 96;
const SPARK_H = 28;

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) {
    return null;
  }
  const max = Math.max(...values);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const step = SPARK_W / (values.length - 1);
  const points = values.map(
    (v, i) =>
      `${(i * step).toFixed(1)},${(SPARK_H - ((v - min) / span) * SPARK_H).toFixed(1)}`
  );
  return (
    <svg
      aria-hidden="true"
      className="overflow-visible"
      height={SPARK_H}
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      width={SPARK_W}
    >
      <polygon
        fill={color}
        opacity={0.12}
        points={`0,${SPARK_H} ${points.join(" ")} ${SPARK_W},${SPARK_H}`}
      />
      <polyline
        fill="none"
        points={points.join(" ")}
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
      />
    </svg>
  );
}

/* ============ Números (eligen qué muestra el gráfico) ============ */

function KpiButton({
  measure,
  report,
  color,
  active,
  spark,
  onSelect,
}: {
  measure: ReportColumn;
  report: ReportResult;
  color: string;
  active: boolean;
  spark: number[];
  onSelect: () => void;
}) {
  const current = report.totals[measure.key] ?? 0;
  const previous = report.previousTotals?.[measure.key];
  const shown = useCountUp(current);
  return (
    <button
      aria-pressed={active}
      className={cn(
        "group relative flex min-w-0 flex-col items-start gap-1 rounded-xl border bg-card p-3 text-left transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-transparent shadow-sm ring-2"
          : "hover:border-foreground/20"
      )}
      onClick={onSelect}
      style={
        active
          ? ({ "--tw-ring-color": color } as React.CSSProperties)
          : undefined
      }
      type="button"
    >
      <span className="flex w-full items-center gap-1.5 text-muted-foreground text-xs">
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ background: color }}
        />
        <span className="truncate">{measure.label}</span>
      </span>
      <span className="font-heading text-xl tabular-nums md:text-2xl">
        {formatValue(shown, measure.format)}
      </span>
      <span className="flex w-full items-end justify-between gap-2">
        {report.previousTotals ? (
          <span className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
            <DeltaBadge
              inverse={INVERSE.has(measure.key)}
              value={delta(current, previous)}
            />
            <span className="tabular-nums">
              antes {formatShort(previous ?? 0, measure.format)}
            </span>
          </span>
        ) : (
          <span />
        )}
        <Sparkline color={color} values={spark} />
      </span>
    </button>
  );
}

export function ReportKpis({
  report,
  activeKey,
  onSelect,
  byDate,
}: {
  report: ReportResult;
  activeKey: string;
  onSelect: (key: string) => void;
  byDate: boolean;
}) {
  const selectable = Boolean(report.spec.groupBy) && !report.series.length;
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
      {report.measures.map((m, i) => (
        <KpiButton
          active={selectable && m.key === activeKey}
          color={SERIES_COLORS[i % SERIES_COLORS.length]}
          key={m.key}
          measure={m}
          onSelect={() => onSelect(m.key)}
          report={report}
          spark={byDate ? sparkline(report.rows, m.key) : []}
        />
      ))}
    </div>
  );
}

/* ============ Gráfico ============ */

type ChartDatum = Record<string, string | number> & { __key: string };

function ChartTooltip({
  active,
  payload,
  label,
  format,
  hint,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
  format: MeasureFormat;
  hint: string | null;
}) {
  if (!(active && payload?.length)) {
    return null;
  }
  return (
    <div className="min-w-44 rounded-lg border bg-popover px-3 py-2 text-popover-foreground text-xs shadow-lg">
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
      {hint ? (
        <p className="mt-1.5 border-t pt-1.5 text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

const AXIS = { fontSize: 11, fill: "var(--muted-foreground)" };
const MAX_PIE_SLICES = 8;
const ROW_HEIGHT = 30;
const DIM = 0.28;

type ChartSetup = {
  chart: ReportResult["spec"]["chart"];
  data: ChartDatum[];
  format: MeasureFormat;
  horizontal: boolean;
  stacked: boolean;
  keys: string[];
  names: Record<string, string>;
  colors: string[];
  selectedKey: string | null;
  hoverKey: string | null;
  hint: string | null;
  onPick: (key: string) => void;
  onHover: (key: string | null) => void;
};

const MARGIN = { left: 4, right: 12, top: 8 };

function chartChrome(setup: ChartSetup) {
  return [
    <Tooltip
      content={<ChartTooltip format={setup.format} hint={setup.hint} />}
      cursor={{ fill: "var(--muted)", opacity: 0.35 }}
      key="tooltip"
    />,
    setup.stacked ? (
      <Legend iconSize={8} key="legend" wrapperStyle={{ fontSize: 12 }} />
    ) : null,
  ];
}

function gradients(setup: ChartSetup, vertical: boolean) {
  return (
    <defs key="defs">
      {setup.keys.map((k, i) => (
        <linearGradient
          id={`rg-${i}`}
          key={k}
          x1="0"
          x2={vertical ? "0" : "1"}
          y1={vertical ? "0" : "0"}
          y2={vertical ? "1" : "0"}
        >
          <stop
            offset="0%"
            stopColor={setup.colors[i]}
            stopOpacity={vertical ? 0.95 : 0.7}
          />
          <stop
            offset="100%"
            stopColor={setup.colors[i]}
            stopOpacity={vertical ? 0.55 : 1}
          />
        </linearGradient>
      ))}
      {setup.keys.map((k, i) => (
        <linearGradient
          id={`ra-${i}`}
          key={`a${k}`}
          x1="0"
          x2="0"
          y1="0"
          y2="1"
        >
          <stop offset="0%" stopColor={setup.colors[i]} stopOpacity={0.35} />
          <stop offset="100%" stopColor={setup.colors[i]} stopOpacity={0.02} />
        </linearGradient>
      ))}
    </defs>
  );
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

/** Clic en un punto de líneas/área: el gráfico avisa qué etiqueta se tocó. */
function pickFromChart(setup: ChartSetup) {
  return (state: { activeTooltipIndex?: number | string | null } | null) => {
    const index = Number(state?.activeTooltipIndex);
    const datum = Number.isFinite(index) ? setup.data[index] : undefined;
    if (datum) {
      setup.onPick(datum.__key);
    }
  };
}

function opacityFor(setup: ChartSetup, key: string): number {
  const focus = setup.selectedKey ?? setup.hoverKey;
  return focus && focus !== key ? DIM : 1;
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
    { __key: REST_KEY, label: "Otros", [key]: rest },
  ];
}

function renderPie(setup: ChartSetup) {
  const slices = pieData(setup.data, setup.keys[0]);
  return (
    <PieChart>
      <Pie
        data={slices}
        dataKey={setup.keys[0]}
        innerRadius="58%"
        label={({ name, percent }) =>
          `${String(name).slice(0, 18)} ${Math.round((percent ?? 0) * 100)}%`
        }
        labelLine={false}
        nameKey="label"
        onClick={(_, index) => setup.onPick(slices[index]?.__key ?? "")}
        onMouseEnter={(_, index) => setup.onHover(slices[index]?.__key ?? null)}
        onMouseLeave={() => setup.onHover(null)}
        outerRadius="86%"
        paddingAngle={1.5}
        stroke="var(--card)"
        strokeWidth={2}
      >
        {slices.map((d, i) => (
          <Cell
            className="cursor-pointer transition-opacity"
            fill={SERIES_COLORS[i % SERIES_COLORS.length]}
            fillOpacity={opacityFor(setup, d.__key)}
            key={d.__key}
          />
        ))}
      </Pie>
      {chartChrome(setup)}
    </PieChart>
  );
}

function dotRadius(selected: boolean, small: boolean): number {
  if (selected) {
    return 5;
  }
  return small ? 0 : 3;
}

function renderLine(setup: ChartSetup) {
  const selectedIndex = setup.data.findIndex(
    (d) => d.__key === setup.selectedKey
  );
  return (
    <LineChart
      className="cursor-pointer"
      data={setup.data}
      margin={MARGIN}
      onClick={pickFromChart(setup)}
    >
      {timeAxes(setup)}
      {chartChrome(setup)}
      {setup.keys.map((k, i) => (
        <Line
          activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--card)" }}
          dataKey={k}
          dot={(props: { cx?: number; cy?: number; index?: number }) => {
            const selected = props.index === selectedIndex;
            const small = setup.data.length > 31;
            return (
              <circle
                cx={props.cx}
                cy={props.cy}
                fill={selected ? setup.colors[i] : "var(--card)"}
                key={`${k}-${props.index}`}
                r={dotRadius(selected, small)}
                stroke={setup.colors[i]}
                strokeWidth={2}
              />
            );
          }}
          key={k}
          name={setup.names[k]}
          stroke={setup.colors[i]}
          strokeWidth={2.25}
          type="monotone"
        />
      ))}
    </LineChart>
  );
}

function renderArea(setup: ChartSetup) {
  return (
    <AreaChart
      className="cursor-pointer"
      data={setup.data}
      margin={MARGIN}
      onClick={pickFromChart(setup)}
    >
      {gradients(setup, true)}
      {timeAxes(setup)}
      {chartChrome(setup)}
      {setup.keys.map((k, i) => (
        <Area
          dataKey={k}
          fill={`url(#ra-${i})`}
          key={k}
          name={setup.names[k]}
          stackId={setup.stacked ? "s" : undefined}
          stroke={setup.colors[i]}
          strokeWidth={2}
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
  return setup.horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0];
}

const LABEL_CHARS = 24;

/** Nombre en una sola línea (cortado si es largo) para el eje de las barras acostadas. */
function CategoryTick({
  x,
  y,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value: string };
}) {
  const text = String(payload?.value ?? "");
  const short =
    text.length > LABEL_CHARS ? `${text.slice(0, LABEL_CHARS - 1)}…` : text;
  return (
    <text
      dominantBaseline="middle"
      fill="var(--muted-foreground)"
      fontSize={11}
      textAnchor="end"
      x={(x ?? 0) - 6}
      y={y}
    >
      <title>{text}</title>
      {short}
    </text>
  );
}

function renderBar(setup: ChartSetup) {
  const { horizontal } = setup;
  const valueTick = (v: number) => formatShort(v, setup.format);
  return (
    <BarChart
      className="cursor-pointer"
      data={setup.data}
      layout={horizontal ? "vertical" : "horizontal"}
      margin={{ ...MARGIN, right: 16 }}
      onClick={pickFromChart(setup)}
      onMouseLeave={() => setup.onHover(null)}
      onMouseMove={(state) => {
        const index = Number(state?.activeTooltipIndex);
        setup.onHover(
          Number.isFinite(index) ? (setup.data[index]?.__key ?? null) : null
        );
      }}
    >
      {gradients(setup, !horizontal)}
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
          tick={<CategoryTick />}
          tickLine={false}
          type="category"
          width={170}
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
          className="cursor-pointer"
          dataKey={k}
          fill={`url(#rg-${i})`}
          key={k}
          maxBarSize={horizontal ? 22 : 48}
          name={setup.names[k]}
          radius={barRadius(setup)}
          stackId={setup.stacked ? "s" : undefined}
        >
          {setup.data.map((d) => (
            <Cell fillOpacity={opacityFor(setup, d.__key)} key={d.__key} />
          ))}
        </Bar>
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

/** Qué se dibuja: la métrica elegida o las series de la segunda dimensión. */
function seriesSetup(report: ReportResult, measureIndex: number) {
  const series = report.series;
  const measure = report.measures[measureIndex];
  if (series.length) {
    return {
      stacked: true,
      format: report.measures[0]?.format ?? ("number" as MeasureFormat),
      keys: series,
      names: Object.fromEntries(series.map((s) => [s, s])),
      colors: series.map((_, i) => SERIES_COLORS[i % SERIES_COLORS.length]),
    };
  }
  return {
    stacked: false,
    format: measure.format,
    keys: [measure.key],
    names: { [measure.key]: measure.label },
    colors: [SERIES_COLORS[measureIndex % SERIES_COLORS.length]],
  };
}

export function ReportChart({
  report,
  measureKey,
  selectedKey,
  onSelect,
  canExplore,
  byDate,
}: {
  report: ReportResult;
  measureKey: string;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  canExplore: boolean;
  byDate: boolean;
}) {
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const measureIndex = Math.max(
    report.measures.findIndex((m) => m.key === measureKey),
    0
  );
  const measure = report.measures[measureIndex];
  const chart = report.spec.chart;

  const data = useMemo<ChartDatum[]>(
    () =>
      report.rows
        // El "Resto" achica todas las barras: se ve en la tabla, no en el gráfico.
        .filter((row) => row.key !== REST_KEY || report.spec.chart === "pie")
        .map((row) => ({
          __key: row.key,
          label: row.label,
          ...row.values,
          ...(row.split ?? {}),
        })),
    [report.rows, report.spec.chart]
  );

  if (!(measure && report.spec.groupBy) || chart === "table" || !data.length) {
    return null;
  }

  const horizontal = chart === "bar" && !byDate && data.length <= 40;
  const height = horizontal
    ? Math.max(220, data.length * ROW_HEIGHT + 40)
    : 340;
  const body = renderChart({
    ...seriesSetup(report, measureIndex),
    chart,
    data,
    horizontal,
    selectedKey,
    hoverKey,
    hint: canExplore ? "Tocá para ver el detalle" : null,
    onPick: (key) => {
      if (key && key !== REST_KEY) {
        onSelect(key === selectedKey ? null : key);
      }
    },
    onHover: setHoverKey,
  });

  return (
    <div
      className="[&_*:focus-visible]:outline-none [&_.recharts-surface:focus]:outline-none [&_.recharts-wrapper:focus]:outline-none"
      style={{ height }}
    >
      <ResponsiveContainer height="100%" width="100%">
        {body}
      </ResponsiveContainer>
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

function useSortedRows(report: ReportResult, sort: SortState, query: string) {
  return useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = q
      ? report.rows.filter((r) => r.label.toLowerCase().includes(q))
      : report.rows;
    if (!sort) {
      return visible;
    }
    const sign = sort.dir === "asc" ? 1 : -1;
    const value = (r: ReportResult["rows"][number]) =>
      r.values[sort.key] ?? r.split?.[sort.key] ?? 0;
    const sorted = visible
      .filter((r) => r.key !== REST_KEY)
      .sort((a, b) =>
        sort.key === "label"
          ? sign * a.label.localeCompare(b.label, "es", { numeric: true })
          : sign * (value(a) - value(b))
      );
    return [...sorted, ...visible.filter((r) => r.key === REST_KEY)];
  }, [report.rows, sort, query]);
}

/** Valor con una barra de fondo proporcional al más grande. */
function BarCell({
  value,
  max,
  format,
  color,
}: {
  value: number;
  max: number;
  format: MeasureFormat;
  color: string | null;
}) {
  const width = color && max > 0 ? Math.max((value / max) * 100, 0) : 0;
  return (
    <td className="relative px-3 py-2 text-right tabular-nums">
      {width ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-1.5 right-1 rounded-sm"
          style={{
            width: `calc(${width}% - 0.5rem)`,
            background: color ?? undefined,
            opacity: 0.13,
          }}
        />
      ) : null}
      <span className="relative">{formatValue(value, format)}</span>
    </td>
  );
}

type TableCtx = {
  report: ReportResult;
  primary: ReportColumn | undefined;
  primaryColor: string;
  compare: boolean;
  showShare: boolean;
  max: number;
};

function TableRow({
  ctx,
  row,
  selected,
  onSelect,
}: {
  ctx: TableCtx;
  row: ReportResult["rows"][number];
  selected: boolean;
  onSelect: (key: string | null) => void;
}) {
  const { report, primary } = ctx;
  const prev = report.previousByKey?.[row.key];
  const isRest = row.key === REST_KEY;
  return (
    <tr
      aria-selected={selected}
      className={cn(
        "border-b transition-colors last:border-0",
        isRest
          ? "text-muted-foreground italic"
          : "cursor-pointer hover:bg-muted/50",
        selected && "bg-primary/[0.07] hover:bg-primary/10"
      )}
      onClick={isRest ? undefined : () => onSelect(selected ? null : row.key)}
    >
      <td
        className={cn(
          "max-w-[280px] truncate border-l-2 px-3 py-2",
          selected ? "border-l-primary font-medium" : "border-l-transparent"
        )}
        title={row.label}
      >
        {row.label}
      </td>
      {report.measures.map((m) => (
        <BarCell
          color={m.key === primary?.key && !isRest ? ctx.primaryColor : null}
          format={m.format}
          key={m.key}
          max={ctx.max}
          value={row.values[m.key] ?? 0}
        />
      ))}
      {ctx.compare && primary ? (
        <td className="px-3 py-2 text-right">
          {isRest ? null : (
            <DeltaBadge
              inverse={INVERSE.has(primary.key)}
              value={delta(row.values[primary.key] ?? 0, prev?.[primary.key])}
            />
          )}
        </td>
      ) : null}
      {ctx.showShare && primary ? (
        <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">
          {share(row.values[primary.key] ?? 0, report.totals[primary.key] ?? 0)}
        </td>
      ) : null}
      {report.series.map((s) => (
        <td className="px-3 py-2 text-right tabular-nums" key={s}>
          {formatValue(
            row.split?.[s] ?? 0,
            report.measures[0]?.format ?? "number"
          )}
        </td>
      ))}
    </tr>
  );
}

function TableFooter({ ctx }: { ctx: TableCtx }) {
  const { report, primary } = ctx;
  return (
    <tfoot className="sticky bottom-0 border-t bg-muted/80 font-medium backdrop-blur">
      <tr>
        <td className="px-3 py-2">Total</td>
        {report.measures.map((m) => (
          <td className="px-3 py-2 text-right tabular-nums" key={m.key}>
            {formatValue(report.totals[m.key] ?? 0, m.format)}
          </td>
        ))}
        {ctx.compare && primary ? (
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
        {ctx.showShare ? <td className="px-3 py-2 text-right">100%</td> : null}
        {report.series.map((s) => (
          <td className="px-3 py-2 text-right tabular-nums" key={s}>
            {formatValue(
              report.rows.reduce((acc, r) => acc + (r.split?.[s] ?? 0), 0),
              report.measures[0]?.format ?? "number"
            )}
          </td>
        ))}
      </tr>
    </tfoot>
  );
}

function TableSearch({
  report,
  query,
  shown,
  onChange,
}: {
  report: ReportResult;
  query: string;
  shown: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 border-b px-3 py-2 text-sm">
      <MagnifyingGlassIcon className="size-4 text-muted-foreground" />
      <span className="sr-only">Buscar en la tabla</span>
      <input
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
        onChange={(e) => onChange(e.target.value)}
        placeholder={`Buscar ${report.groupLabel?.toLowerCase() ?? ""}…`}
        value={query}
      />
      <span className="text-muted-foreground text-xs tabular-nums">
        {shown} de {report.rows.length}
      </span>
    </label>
  );
}

function tableContext(report: ReportResult, measureKey: string): TableCtx {
  const primary =
    report.measures.find((m) => m.key === measureKey) ?? report.measures[0];
  const primaryIndex = Math.max(
    report.measures.findIndex((m) => m.key === primary?.key),
    0
  );
  return {
    report,
    primary,
    primaryColor: SERIES_COLORS[primaryIndex % SERIES_COLORS.length],
    compare: Boolean(report.previousByKey),
    showShare: Boolean(primary?.additive && report.spec.groupBy),
    max: Math.max(
      ...report.rows
        .filter((r) => r.key !== REST_KEY)
        .map((r) => r.values[primary?.key ?? ""] ?? 0),
      0
    ),
  };
}

export function ReportTable({
  report,
  measureKey,
  selectedKey,
  onSelect,
}: {
  report: ReportResult;
  measureKey: string;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
}) {
  const [sort, setSort] = useState<SortState>(null);
  const [query, setQuery] = useState("");
  const ctx = tableContext(report, measureKey);
  const rows = useSortedRows(report, sort, query);

  const toggle = (key: string) =>
    setSort((prev) =>
      prev?.key === key
        ? { key, dir: prev.dir === "desc" ? "asc" : "desc" }
        : { key, dir: key === "label" ? "asc" : "desc" }
    );

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {report.rows.length > 8 ? (
        <TableSearch
          onChange={setQuery}
          query={query}
          report={report}
          shown={rows.length}
        />
      ) : null}
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
              {ctx.compare ? (
                <th className="px-3 py-2 text-right font-medium">vs. antes</th>
              ) : null}
              {ctx.showShare ? (
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
            {rows.map((row) => (
              <TableRow
                ctx={ctx}
                key={row.key}
                onSelect={onSelect}
                row={row}
                selected={row.key === selectedKey}
              />
            ))}
          </tbody>
          {report.spec.groupBy && report.rows.length > 1 && !query ? (
            <TableFooter ctx={ctx} />
          ) : null}
        </table>
      </div>
    </div>
  );
}

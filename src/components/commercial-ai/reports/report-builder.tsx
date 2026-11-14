"use client";

import {
  ChartBarHorizontalIcon,
  ChartLineIcon,
  ChartPieSliceIcon,
  FunnelSimpleIcon,
  type Icon,
  PlusIcon,
  TableIcon,
  WaveSineIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  type ChartKind,
  DATASET_GROUPS,
  type Dataset,
  defaultSpec,
  GRAINS,
  type Grain,
  MAX_MEASURES,
  PERIOD_PRESETS,
  type PeriodPreset,
  type ReportSpec,
} from "@/modules/commercial-ai/reports/catalog";

const NONE = "__none__";

const CHART_ICONS: { key: ChartKind; label: string; icon: Icon }[] = [
  { key: "bar", label: "Barras", icon: ChartBarHorizontalIcon },
  { key: "line", label: "Líneas", icon: ChartLineIcon },
  { key: "area", label: "Área", icon: WaveSineIcon },
  { key: "pie", label: "Torta", icon: ChartPieSliceIcon },
  { key: "table", label: "Solo tabla", icon: TableIcon },
];

const LIMITS = [5, 10, 20, 25, 30, 50, 100];

/** Las opciones de top, más la que trae el reporte si es otra (por ejemplo, 40). */
function limitOptions(current: number | null): number[] {
  return current && !LIMITS.includes(current)
    ? [...LIMITS, current].sort((a, b) => a - b)
    : LIMITS;
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-muted-foreground text-xs">{label}</Label>
      {children}
    </div>
  );
}

/* ============ Filtros ============ */

function FilterPicker({
  dataset,
  options,
  onAdd,
}: {
  dataset: Dataset;
  options: Record<string, string[]>;
  onAdd: (dimension: string, values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dimension, setDimension] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const dims = dataset.dimensions.filter(
    (d) => d.type !== "date" && (options[d.key]?.length ?? 0) > 0
  );
  const values = dimension ? (options[dimension] ?? []) : [];

  const close = () => {
    setOpen(false);
    setDimension(null);
    setPicked([]);
  };

  return (
    <Popover
      onOpenChange={(next) => (next ? setOpen(true) : close())}
      open={open}
    >
      <PopoverTrigger asChild>
        <Button
          className="h-8"
          disabled={!dims.length}
          size="sm"
          variant="outline"
        >
          <PlusIcon />
          Filtro
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        {dimension ? (
          <Command>
            <CommandInput
              placeholder={`Buscar ${dataset.dimensions.find((d) => d.key === dimension)?.label.toLowerCase()}…`}
            />
            <CommandList className="max-h-64">
              <CommandEmpty>Sin resultados.</CommandEmpty>
              <CommandGroup>
                {values.map((value) => {
                  const checked = picked.includes(value);
                  return (
                    <CommandItem
                      key={value}
                      onSelect={() =>
                        setPicked((prev) =>
                          checked
                            ? prev.filter((v) => v !== value)
                            : [...prev, value]
                        )
                      }
                      value={value}
                    >
                      <Checkbox
                        checked={checked}
                        className="pointer-events-none"
                      />
                      <span className="truncate">{value}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
            <div className="flex items-center gap-2 border-t p-2">
              <Button
                onClick={() => setDimension(null)}
                size="sm"
                variant="ghost"
              >
                Volver
              </Button>
              <Button
                className="ml-auto"
                disabled={!picked.length}
                onClick={() => {
                  onAdd(dimension, picked);
                  close();
                }}
                size="sm"
              >
                Aplicar{picked.length ? ` (${picked.length})` : ""}
              </Button>
            </div>
          </Command>
        ) : (
          <div className="p-1">
            <p className="px-2 py-1.5 text-muted-foreground text-xs">
              Filtrar por
            </p>
            {dims.map((d) => (
              <button
                className="flex w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                key={d.key}
                onClick={() => setDimension(d.key)}
                type="button"
              >
                {d.label}
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ViewOptions({
  spec,
  dataset,
  byDate,
  onChange,
}: {
  spec: ReportSpec;
  dataset: Dataset;
  byDate: boolean;
  onChange: (patch: Partial<ReportSpec>) => void;
}) {
  const set = onChange;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3">
      {byDate ? (
        <div className="flex items-center gap-1">
          <span className="mr-1 text-muted-foreground text-xs">Ver por</span>
          {GRAINS.map((g) => (
            <button
              className={cn(
                "rounded-md px-2 py-1 text-xs transition-colors",
                spec.grain === g.key
                  ? "bg-primary/10 font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
              key={g.key}
              onClick={() => set({ grain: g.key as Grain })}
              type="button"
            >
              {g.label}
            </button>
          ))}
        </div>
      ) : null}

      {spec.groupBy && !byDate ? (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">Mostrar</span>
          <Select
            onValueChange={(value) =>
              set({ limit: value === NONE ? null : Number(value) })
            }
            value={spec.limit ? String(spec.limit) : NONE}
          >
            <SelectTrigger className="h-8 w-28" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {limitOptions(spec.limit).map((n) => (
                <SelectItem key={n} value={String(n)}>
                  Top {n}
                </SelectItem>
              ))}
              <SelectItem value={NONE}>Todos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {spec.groupBy ? (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">Ordenar</span>
          <Select
            onValueChange={(value) => {
              if (value === NONE) {
                set({ sort: null });
                return;
              }
              const [by, dir] = value.split("|");
              set({ sort: { by, dir: dir as "asc" | "desc" } });
            }}
            value={spec.sort ? `${spec.sort.by}|${spec.sort.dir}` : NONE}
          >
            <SelectTrigger className="h-8 w-48" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Automático</SelectItem>
              {dataset.measures
                .filter((m) => spec.measures.includes(m.key))
                .flatMap((m) => [
                  <SelectItem key={`${m.key}d`} value={`${m.key}|desc`}>
                    {m.label}: mayor a menor
                  </SelectItem>,
                  <SelectItem key={`${m.key}a`} value={`${m.key}|asc`}>
                    {m.label}: menor a mayor
                  </SelectItem>,
                ])}
              <SelectItem value="label|asc">Alfabético</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {dataset.dated ? (
        <div className="flex items-center gap-2 text-sm">
          <Switch
            aria-label="Comparar con el período anterior"
            checked={spec.compare}
            onCheckedChange={(compare) => set({ compare })}
          />
          <span className="text-muted-foreground text-xs">
            Comparar con el período anterior
          </span>
        </div>
      ) : null}

      <div className="ml-auto flex items-center gap-0.5 rounded-lg border p-0.5">
        {CHART_ICONS.map((c) => {
          const ChartIcon = c.icon;
          const disabled = c.key === "pie" && (byDate || Boolean(spec.splitBy));
          return (
            <button
              aria-label={c.label}
              className={cn(
                "rounded-md p-1.5 transition-colors disabled:opacity-30",
                spec.chart === c.key
                  ? "bg-primary/10 text-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
              disabled={disabled}
              key={c.key}
              onClick={() => set({ chart: c.key })}
              title={c.label}
              type="button"
            >
              <ChartIcon
                className="size-4"
                weight={spec.chart === c.key ? "fill" : "regular"}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FiltersRow({
  spec,
  dataset,
  filterOptions,
  onChange,
}: {
  spec: ReportSpec;
  dataset: Dataset;
  filterOptions: Record<string, string[]>;
  onChange: (patch: Partial<ReportSpec>) => void;
}) {
  const set = onChange;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <FunnelSimpleIcon className="size-4 text-muted-foreground" />
      {spec.filters.map((f, index) => {
        const label =
          dataset.dimensions.find((d) => d.key === f.dimension)?.label ??
          f.dimension;
        return (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs"
            key={`${f.dimension}-${index}`}
          >
            <b className="font-medium">{label}:</b>
            <span className="max-w-[220px] truncate">
              {f.values.join(", ")}
            </span>
            <button
              aria-label={`Quitar filtro ${label}`}
              className="rounded-full p-0.5 hover:bg-background"
              onClick={() =>
                set({ filters: spec.filters.filter((_, i) => i !== index) })
              }
              type="button"
            >
              <XIcon className="size-3" />
            </button>
          </span>
        );
      })}
      <FilterPicker
        dataset={dataset}
        onAdd={(dimension, values) =>
          set({
            filters: [
              ...spec.filters.filter((f) => f.dimension !== dimension),
              { dimension, values },
            ],
          })
        }
        options={filterOptions}
      />
    </div>
  );
}

/* ============ Constructor ============ */

export function ReportBuilder({
  spec,
  dataset,
  datasets,
  filterOptions,
  onChange,
}: {
  spec: ReportSpec;
  dataset: Dataset;
  datasets: Dataset[];
  filterOptions: Record<string, string[]>;
  onChange: (next: ReportSpec) => void;
}) {
  const set = (patch: Partial<ReportSpec>) =>
    onChange({ ...spec, ...patch, title: patch.title ?? null });
  const groupDim = dataset.dimensions.find((d) => d.key === spec.groupBy);
  const byDate = groupDim?.type === "date";

  const toggleMeasure = (key: string) => {
    const has = spec.measures.includes(key);
    if (has && spec.measures.length === 1) {
      return;
    }
    const measures = has
      ? spec.measures.filter((m) => m !== key)
      : [...spec.measures, key].slice(-MAX_MEASURES);
    set({
      measures,
      sort:
        spec.sort &&
        !measures.includes(spec.sort.by) &&
        spec.sort.by !== "label"
          ? null
          : spec.sort,
    });
  };

  const setGroupBy = (value: string) => {
    const groupBy = value === NONE ? null : value;
    const isDate =
      dataset.dimensions.find((d) => d.key === groupBy)?.type === "date";
    set({
      groupBy,
      splitBy: spec.splitBy === groupBy ? null : spec.splitBy,
      limit: isDate || !groupBy ? null : (spec.limit ?? 20),
      chart: isDate && spec.chart === "pie" ? "line" : spec.chart,
      sort: null,
    });
  };

  return (
    <div className="space-y-3 rounded-xl border bg-card p-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Datos">
          <Select
            onValueChange={(id) => {
              const next = datasets.find((d) => d.id === id);
              if (next) {
                onChange({
                  ...defaultSpec(next),
                  period: next.dated ? spec.period : "este_mes",
                  from: spec.from,
                  to: spec.to,
                });
              }
            }}
            value={dataset.id}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATASET_GROUPS.map((group) => {
                const items = datasets.filter((d) => d.group === group);
                return items.length ? (
                  <SelectGroup key={group}>
                    <SelectLabel>{group}</SelectLabel>
                    {items.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ) : null;
              })}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Agrupar por">
          <Select onValueChange={setGroupBy} value={spec.groupBy ?? NONE}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Sin agrupar (solo totales)</SelectItem>
              {dataset.dimensions.map((d) => (
                <SelectItem key={d.key} value={d.key}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {dataset.dated ? (
          <Field label={dataset.dateLabel ?? "Período"}>
            <Select
              onValueChange={(value) => set({ period: value as PeriodPreset })}
              value={spec.period}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_PRESETS.map((p) => (
                  <SelectItem key={p.key} value={p.key}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : (
          <Field label="Período">
            <p className="flex h-9 items-center rounded-md border border-dashed px-3 text-muted-foreground text-sm">
              Foto de hoy
            </p>
          </Field>
        )}

        <Field label="Abrir cada barra por (opcional)">
          <Select
            onValueChange={(value) =>
              set({ splitBy: value === NONE ? null : value })
            }
            value={spec.splitBy ?? NONE}
          >
            <SelectTrigger className="w-full" disabled={!spec.groupBy}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No abrir</SelectItem>
              {dataset.dimensions
                .filter((d) => d.key !== spec.groupBy)
                .map((d) => (
                  <SelectItem key={d.key} value={d.key}>
                    {d.label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {spec.period === "personalizado" && dataset.dated ? (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Desde">
            <Input
              className="h-9 w-40"
              onChange={(e) => set({ from: e.target.value })}
              type="date"
              value={spec.from ?? ""}
            />
          </Field>
          <Field label="Hasta">
            <Input
              className="h-9 w-40"
              onChange={(e) => set({ to: e.target.value })}
              type="date"
              value={spec.to ?? ""}
            />
          </Field>
        </div>
      ) : null}

      <Field label="Qué medir">
        <div className="flex flex-wrap gap-1.5">
          {dataset.measures.map((m) => {
            const active = spec.measures.includes(m.key);
            return (
              <button
                className={cn(
                  "rounded-full border px-3 py-1 text-sm transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                key={m.key}
                onClick={() => toggleMeasure(m.key)}
                title={m.hint}
                type="button"
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </Field>

      <ViewOptions
        byDate={byDate}
        dataset={dataset}
        onChange={set}
        spec={spec}
      />

      <FiltersRow
        dataset={dataset}
        filterOptions={filterOptions}
        onChange={set}
        spec={spec}
      />
    </div>
  );
}

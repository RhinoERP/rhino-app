"use client";

import {
  ArrowLeftIcon,
  BookmarkSimpleIcon,
  ChartBarIcon,
  DownloadSimpleIcon,
  PrinterIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  DATASET_GROUPS,
  type DatasetGroup,
  datasetsFor,
  defaultSpec,
  type ReportSpec,
  sanitizeSpec,
} from "@/modules/reports/catalog";
import {
  deleteReportAction,
  getReportsHomeAction,
  type ReportsHome,
  runReportAction,
  saveReportAction,
} from "@/modules/reports/reports.actions";
import type { ReportResult } from "@/modules/reports/run-report";
import { REPORT_TEMPLATES } from "@/modules/reports/templates";
import { BuilderPanel } from "./builder-panel";
import { ChartGlyph, GROUP_COLORS } from "./chart-glyph";
import { ReportBody } from "./report-body";
import { downloadCsv, downloadExcel } from "./report-format";

const RUN_DELAY_MS = 350;

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: organiza la navegación, el constructor y los guardados en una sola vista
export function ReportsPage({
  orgSlug,
  isManager,
}: {
  orgSlug: string;
  isManager: boolean;
}) {
  const [home, setHome] = useState<ReportsHome | null>(null);
  const [homeError, setHomeError] = useState("");
  const [spec, setSpec] = useState<ReportSpec | null>(null);
  const [report, setReport] = useState<ReportResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [savedId, setSavedId] = useState<string | undefined>();
  const [trail, setTrail] = useState<ReportSpec[]>([]);
  const [group, setGroup] = useState<DatasetGroup | "Todos">("Todos");
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [saving, setSaving] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    let active = true;
    getReportsHomeAction(orgSlug).then((result) => {
      if (!active) {
        return;
      }
      if (result.success) {
        setHome(result.data);
      } else {
        setHomeError(result.error);
      }
    });
    return () => {
      active = false;
    };
  }, [orgSlug]);

  const datasets = useMemo(
    () =>
      datasetsFor(["organization.admin"], isManager).filter((source) =>
        home?.datasets.includes(source.id)
      ),
    [home, isManager]
  );
  const dataset = datasets.find((source) => source.id === spec?.dataset);
  const templates = REPORT_TEMPLATES.filter((template) => {
    const source = datasets.find((d) => d.id === template.spec.dataset);
    return (
      source &&
      template.spec.measures?.every((key) =>
        source.measures.some((measure) => measure.key === key)
      ) &&
      (group === "Todos" || group === template.group)
    );
  });

  const run = useCallback(
    async (next: ReportSpec) => {
      requestId.current += 1;
      const id = requestId.current;
      setLoading(true);
      setError("");
      const result = await runReportAction(orgSlug, next);
      if (id !== requestId.current) {
        return;
      }
      setLoading(false);
      if (result.success) {
        setReport(result.report);
      } else {
        setReport(null);
        setError(result.error);
      }
    },
    [orgSlug]
  );

  useEffect(() => {
    if (!spec) {
      return;
    }
    const timer = setTimeout(() => run(spec), RUN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [spec, run]);

  const open = (input: Partial<ReportSpec>, id?: string) => {
    const clean = sanitizeSpec(input);
    if (!clean) {
      return;
    }
    requestId.current += 1;
    setSpec(clean);
    setReport(null);
    setError("");
    setTrail([]);
    setSavedId(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const back = () => {
    requestId.current += 1;
    setSpec(null);
    setReport(null);
    setTrail([]);
    setSavedId(undefined);
  };

  const save = async () => {
    if (!spec) {
      return;
    }
    setSaving(true);
    try {
      const result = await saveReportAction(
        orgSlug,
        { id: savedId, name: name.trim(), shared },
        spec
      );
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setHome((prev) => (prev ? { ...prev, saved: result.saved } : prev));
      setSpec((prev) => (prev ? { ...prev, title: name.trim() } : prev));
      setSavedId(
        result.saved.find((item) => item.mine && item.name === name.trim())?.id
      );
      setSaveOpen(false);
      toast.success("Reporte guardado.");
    } finally {
      setSaving(false);
    }
  };

  if (homeError) {
    return <p className="rounded-xl border p-6 text-sm">{homeError}</p>;
  }
  if (!home) {
    return <Skeleton className="h-64 rounded-xl" />;
  }

  return (
    <div className="space-y-5 print:space-y-2">
      {spec && dataset ? (
        <>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Button onClick={back} size="sm" variant="ghost">
              <ArrowLeftIcon /> Reportes
            </Button>
            <div className="min-w-0">
              <h1 className="truncate font-heading text-xl">
                {report?.title ?? spec.title ?? dataset.label}
              </h1>
              <p className="text-muted-foreground text-xs">
                {dataset.label}
                {report?.periodLabel ? ` · ${report.periodLabel}` : ""}
              </p>
            </div>
            <div className="ml-auto flex gap-2">
              <Button
                disabled={!report}
                onClick={() => {
                  setName(report?.title ?? "");
                  setShared(
                    home.saved.find((item) => item.id === savedId)?.shared ??
                      false
                  );
                  setSaveOpen(true);
                }}
                size="sm"
                variant="outline"
              >
                <BookmarkSimpleIcon /> Guardar
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    disabled={!report?.rows.length}
                    size="sm"
                    variant="outline"
                  >
                    <DownloadSimpleIcon /> Exportar
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => report && downloadExcel(report)}
                  >
                    Excel (.xlsx)
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => report && downloadCsv(report)}
                  >
                    CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => window.print()}>
                    <PrinterIcon /> Imprimir / PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <div className="hidden print:block">
            <h1 className="font-heading text-xl">
              {report?.title ?? dataset.label}
            </h1>
            <p>{report?.periodLabel}</p>
          </div>
          <div className="print:hidden">
            <BuilderPanel
              dataset={dataset}
              datasets={datasets}
              filterOptions={report?.filterOptions ?? {}}
              onChange={setSpec}
              spec={spec}
            />
          </div>
          {error ? (
            <p className="rounded-xl border border-destructive/30 p-3 text-destructive text-sm">
              {error}
            </p>
          ) : null}
          {report ? (
            <ReportBody
              backLabel={trail.at(-1)?.title ?? null}
              dataset={dataset}
              loading={loading}
              onBack={() => {
                const previous = trail.at(-1);
                if (previous) {
                  setTrail((list) => list.slice(0, -1));
                  setSpec(previous);
                }
              }}
              onExplore={(next) => {
                setTrail((list) => [...list, { ...spec, title: report.title }]);
                setSpec(next);
              }}
              report={report}
            />
          ) : null}
          {!report && loading ? <Skeleton className="h-80 rounded-xl" /> : null}
        </>
      ) : (
        <>
          <div>
            <h1 className="flex items-center gap-2 font-heading text-2xl">
              <ChartBarIcon /> Reportes
            </h1>
            <p className="text-muted-foreground text-sm">
              Elegí un reporte listo o armá uno con las métricas de tu
              organización.
            </p>
          </div>
          {home.saved.length ? (
            <section className="space-y-2">
              <h2 className="font-semibold">Reportes guardados</h2>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {home.saved.map((item) => (
                  <div
                    className="flex items-center rounded-xl border bg-card p-2"
                    key={item.id}
                  >
                    <button
                      className="min-w-0 flex-1 p-2 text-left"
                      onClick={() =>
                        open(
                          { ...item.spec, title: item.name },
                          item.mine ? item.id : undefined
                        )
                      }
                      type="button"
                    >
                      <span className="block truncate font-medium">
                        {item.name}
                      </span>
                      <span className="block text-muted-foreground text-xs">
                        {item.shared ? "Compartido" : "Privado"}
                        {item.mine
                          ? ""
                          : ` · ${item.userName ?? "Otro usuario"}`}
                      </span>
                    </button>
                    {item.mine ? (
                      <Button
                        aria-label={`Borrar ${item.name}`}
                        onClick={async () => {
                          const result = await deleteReportAction(
                            orgSlug,
                            item.id
                          );
                          if (result.success) {
                            setHome((prev) =>
                              prev ? { ...prev, saved: result.saved } : prev
                            );
                          } else {
                            toast.error(result.error);
                          }
                        }}
                        size="icon"
                        variant="ghost"
                      >
                        <TrashIcon />
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          <section className="space-y-3">
            <h2 className="font-semibold">Reportes listos</h2>
            <div className="flex flex-wrap gap-2">
              {(["Todos", ...DATASET_GROUPS] as const).map((key) => (
                <Button
                  key={key}
                  onClick={() => setGroup(key)}
                  size="sm"
                  variant={group === key ? "default" : "outline"}
                >
                  {key}
                </Button>
              ))}
            </div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {templates.map((template) => (
                <button
                  className="flex items-center gap-3 rounded-xl border bg-card p-3 text-left hover:border-primary"
                  key={template.id}
                  onClick={() =>
                    open({ ...template.spec, title: template.title })
                  }
                  type="button"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-muted-foreground text-xs">
                      {template.group}
                    </span>
                    <span className="block font-medium">{template.title}</span>
                    <span className="block text-muted-foreground text-xs">
                      {template.description}
                    </span>
                  </span>
                  <ChartGlyph
                    color={GROUP_COLORS[template.group]}
                    kind={template.spec.chart ?? "bar"}
                    ranking={template.spec.groupBy !== "fecha"}
                  />
                </button>
              ))}
            </div>
          </section>
          <section className="space-y-3">
            <h2 className="font-semibold">Armá uno desde cero</h2>
            <div className="grid gap-2 md:grid-cols-3">
              {datasets.map((source) => (
                <button
                  className="rounded-xl border border-dashed bg-card p-3 text-left hover:border-primary"
                  key={source.id}
                  onClick={() => open(defaultSpec(source))}
                  type="button"
                >
                  <span className="block font-medium">{source.label}</span>
                  <span className="text-muted-foreground text-xs">
                    {source.description}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      <Dialog onOpenChange={setSaveOpen} open={saveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Guardar reporte</DialogTitle>
            <DialogDescription>
              Se actualiza con los datos del momento cada vez que lo abrís.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="report-name">Nombre</Label>
            <Input
              id="report-name"
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
            <div className="flex items-center gap-2">
              <Switch
                checked={shared}
                id="report-shared"
                onCheckedChange={setShared}
              />
              <Label htmlFor="report-shared">
                Compartir con la organización
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setSaveOpen(false)} variant="ghost">
              Cancelar
            </Button>
            <Button disabled={saving || !name.trim()} onClick={save}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

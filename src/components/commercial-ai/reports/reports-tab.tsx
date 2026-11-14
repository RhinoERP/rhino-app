"use client";

import {
  ArrowLeftIcon,
  BookmarkSimpleIcon,
  CoinsIcon,
  DownloadSimpleIcon,
  type Icon,
  PackageIcon,
  PrinterIcon,
  ReceiptIcon,
  ShoppingCartIcon,
  SparkleIcon,
  StorefrontIcon,
  TrashIcon,
  UsersIcon,
  UsersThreeIcon,
  WalletIcon,
} from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  askReportAction,
  deleteReportAction,
  explainReportAction,
  getReportsHomeAction,
  type ReportsHome,
  runReportAction,
  type SavedReport,
  saveReportAction,
} from "@/modules/commercial-ai/actions/reports.actions";
import {
  DATASET_GROUPS,
  DATASETS,
  type Dataset,
  type DatasetGroup,
  datasetById,
  defaultSpec,
  type ReportSpec,
  sanitizeSpec,
} from "@/modules/commercial-ai/reports/catalog";
import type { ReportResult } from "@/modules/commercial-ai/reports/run-report";
import {
  REPORT_TEMPLATES,
  type ReportTemplate,
} from "@/modules/commercial-ai/reports/templates";
import { RhinoAvatar } from "../rhino/rhino-avatar";
import { RhinoText } from "../rhino/rhino-text";
import { useCommercialAi } from "../shared";
import { ReportBuilder } from "./report-builder";
import { downloadCsv, downloadExcel } from "./report-format";
import { ReportChart, ReportKpis, ReportTable } from "./report-view";

const GROUP_ICONS: Record<DatasetGroup, Icon> = {
  Ventas: StorefrontIcon,
  Clientes: UsersIcon,
  Cobranzas: WalletIcon,
  Compras: ShoppingCartIcon,
  Finanzas: CoinsIcon,
  Stock: PackageIcon,
  Equipo: UsersThreeIcon,
};

const EXAMPLES = [
  "Ventas por vendedor este mes contra el anterior",
  "Los 10 productos más vendidos en kilos del trimestre",
  "Qué clientes deben más de 60 días",
  "Compras por proveedor este año",
  "Stock valorizado por marca",
  "Cobranzas por medio de pago del mes pasado",
];

const RUN_DELAY_MS = 350;

/* ============ Pedido a RHINO ============ */

function askPlaceholder(aiEnabled: boolean, inReport: boolean): string {
  if (!aiEnabled) {
    return "Pedir con palabras se habilita cuando se active la IA";
  }
  return inReport
    ? "Cambialo con palabras: “ahora por mes”, “solo Pendino”, “sumá los kilos”…"
    : "Pedile un reporte a RHINO: “ventas por zona del último trimestre”";
}

function AskBar({
  aiEnabled,
  pending,
  onAsk,
  inReport,
}: {
  aiEnabled: boolean;
  pending: boolean;
  onAsk: (question: string) => void;
  inReport: boolean;
}) {
  const [question, setQuestion] = useState("");
  const submit = (text: string) => {
    if (text.trim().length >= 3 && !pending) {
      onAsk(text.trim());
      setQuestion("");
    }
  };
  return (
    <div className="rounded-xl border bg-gradient-to-br from-primary/10 via-card to-card p-3 md:p-4">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit(question);
        }}
      >
        <RhinoAvatar className="hidden sm:inline-flex" size={36} />
        <Input
          aria-label="Pedile un reporte a RHINO"
          className="h-11 flex-1 bg-background text-base"
          disabled={!aiEnabled || pending}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={askPlaceholder(aiEnabled, inReport)}
          value={question}
        />
        <Button
          className="h-11"
          disabled={!aiEnabled || pending || question.trim().length < 3}
          type="submit"
        >
          {pending ? <Spinner /> : <SparkleIcon weight="fill" />}
          <span className="hidden sm:inline">
            {inReport ? "Cambiar" : "Armar"}
          </span>
        </Button>
      </form>
      {inReport || !aiEnabled ? null : (
        <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-0.5 sm:flex-wrap">
          {EXAMPLES.map((example) => (
            <button
              className="shrink-0 rounded-full border bg-background px-2.5 py-1 text-muted-foreground text-xs transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              disabled={pending}
              key={example}
              onClick={() => submit(example)}
              type="button"
            >
              {example}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============ Inicio ============ */

function TemplateCard({
  template,
  onOpen,
}: {
  template: ReportTemplate;
  onOpen: () => void;
}) {
  const GroupIcon = GROUP_ICONS[template.group];
  return (
    <button
      className="group flex items-start gap-3 rounded-xl border bg-card p-3 text-left transition-all hover:border-primary/40 hover:shadow-sm"
      onClick={onOpen}
      type="button"
    >
      <span className="rounded-lg bg-primary/10 p-2 text-primary">
        <GroupIcon className="size-4" weight="duotone" />
      </span>
      <span className="min-w-0">
        <span className="block font-medium text-sm group-hover:text-primary">
          {template.title}
        </span>
        <span className="mt-0.5 block text-muted-foreground text-xs leading-snug">
          {template.description}
        </span>
      </span>
    </button>
  );
}

function SavedCard({
  saved,
  onOpen,
  onDelete,
}: {
  saved: SavedReport;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const dataset = datasetById(saved.spec.dataset);
  return (
    <div className="group flex items-center gap-3 rounded-xl border bg-card p-3 transition-all hover:border-primary/40">
      <button
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        onClick={onOpen}
        type="button"
      >
        <span className="rounded-lg bg-amber-500/10 p-2 text-amber-600">
          <BookmarkSimpleIcon className="size-4" weight="fill" />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-medium text-sm">
            {saved.name}
          </span>
          <span className="block truncate text-muted-foreground text-xs">
            {dataset?.label}
            {saved.mine ? "" : ` · de ${saved.userName ?? "otro usuario"}`}
          </span>
        </span>
      </button>
      {saved.shared ? <Badge variant="secondary">Compartido</Badge> : null}
      {saved.mine ? (
        <Button
          aria-label={`Borrar ${saved.name}`}
          className="size-8 opacity-60 hover:opacity-100"
          onClick={onDelete}
          size="icon"
          variant="ghost"
        >
          <TrashIcon />
        </Button>
      ) : null}
    </div>
  );
}

function Home({
  home,
  datasets,
  onOpen,
  onDelete,
}: {
  home: ReportsHome;
  datasets: Dataset[];
  onOpen: (
    spec: Partial<ReportSpec> & { dataset: string },
    savedId?: string
  ) => void;
  onDelete: (saved: SavedReport) => void;
}) {
  const [group, setGroup] = useState<DatasetGroup | "Todos">("Todos");
  const allowed = new Set(datasets.map((d) => d.id));
  const templates = REPORT_TEMPLATES.filter((t) => allowed.has(t.spec.dataset));
  const groups = DATASET_GROUPS.filter((g) =>
    templates.some((t) => t.group === g)
  );
  const shown = templates.filter((t) => group === "Todos" || t.group === group);

  return (
    <div className="space-y-6">
      {home.saved.length ? (
        <section className="space-y-2">
          <h2 className="font-semibold text-sm">Tus reportes guardados</h2>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {home.saved.map((saved) => (
              <SavedCard
                key={saved.id}
                onDelete={() => onDelete(saved)}
                onOpen={() =>
                  onOpen(
                    { ...saved.spec, title: saved.name },
                    saved.mine ? saved.id : undefined
                  )
                }
                saved={saved}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-2 font-semibold text-sm">Reportes listos</h2>
          {(["Todos", ...groups] as const).map((g) => (
            <button
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs transition-colors",
                group === g
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
              key={g}
              onClick={() => setGroup(g)}
              type="button"
            >
              {g}
            </button>
          ))}
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((template) => (
            <TemplateCard
              key={template.id}
              onOpen={() => onOpen({ ...template.spec, title: template.title })}
              template={template}
            />
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-sm">O armá uno desde cero</h2>
        <p className="text-muted-foreground text-xs">
          Elegí qué datos querés mirar; después agrupás, filtrás y cambiás el
          gráfico como quieras.
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
          {datasets.map((d) => {
            const GroupIcon = GROUP_ICONS[d.group];
            return (
              <button
                className="flex flex-col gap-1 rounded-xl border border-dashed bg-card p-3 text-left transition-all hover:border-primary/50 hover:border-solid"
                key={d.id}
                onClick={() => onOpen(defaultSpec(d))}
                type="button"
              >
                <span className="flex items-center gap-1.5 font-medium text-sm">
                  <GroupIcon className="size-4 text-primary" weight="duotone" />
                  {d.label}
                </span>
                <span className="text-muted-foreground text-xs leading-snug">
                  {d.description}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/* ============ Guardar ============ */

function SaveDialog({
  open,
  onOpenChange,
  initialName,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName: string;
  onSave: (name: string, shared: boolean) => Promise<boolean>;
}) {
  const [name, setName] = useState(initialName);
  const [shared, setShared] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setName(initialName);
    }
  }, [open, initialName]);
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Guardar reporte</DialogTitle>
          <DialogDescription>
            Queda en “Tus reportes guardados” y se actualiza con los datos del
            momento cada vez que lo abrís.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="report-name">Nombre</Label>
            <Input
              id="report-name"
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              value={name}
            />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Switch
              checked={shared}
              id="report-shared"
              onCheckedChange={setShared}
            />
            <Label htmlFor="report-shared">
              Compartirlo con el resto de la empresa
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="ghost">
            Cancelar
          </Button>
          <Button
            disabled={saving || !name.trim()}
            onClick={async () => {
              setSaving(true);
              const ok = await onSave(name.trim(), shared);
              setSaving(false);
              if (ok) {
                onOpenChange(false);
              }
            }}
          >
            {saving ? <Spinner /> : null}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============ Pestaña ============ */

function ReportSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton className="h-20 rounded-xl" key={i} />
        ))}
      </div>
      <Skeleton className="h-80 rounded-xl" />
    </div>
  );
}

function ReportHeader({
  aiEnabled,
  dataset,
  spec,
  report,
  explaining,
  onBack,
  onExplain,
  onSave,
}: {
  aiEnabled: boolean;
  dataset: Dataset;
  spec: ReportSpec;
  report: ReportResult | null;
  explaining: boolean;
  onBack: () => void;
  onExplain: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        className="print:hidden"
        onClick={onBack}
        size="sm"
        variant="ghost"
      >
        <ArrowLeftIcon />
        Reportes
      </Button>
      <div className="min-w-0">
        <h2 className="truncate font-heading text-lg leading-tight">
          {report?.title ?? spec.title ?? dataset.label}
        </h2>
        <p className="text-muted-foreground text-xs">
          {dataset.label}
          {report?.periodLabel ? ` · ${report.periodLabel}` : ""}
          {report?.previousRange ? " · comparado con el período anterior" : ""}
        </p>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-1.5 print:hidden">
        {aiEnabled ? (
          <Button
            disabled={!report || explaining}
            onClick={onExplain}
            size="sm"
            variant="outline"
          >
            {explaining ? <Spinner /> : <SparkleIcon weight="fill" />}
            Conclusiones de RHINO
          </Button>
        ) : null}
        <Button disabled={!report} onClick={onSave} size="sm" variant="outline">
          <BookmarkSimpleIcon />
          Guardar
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button disabled={!report?.rows.length} size="sm" variant="outline">
              <DownloadSimpleIcon />
              Exportar
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => report && downloadExcel(report)}>
              <ReceiptIcon />
              Excel (.xlsx)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => report && downloadCsv(report)}>
              <ReceiptIcon />
              CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => window.print()}>
              <PrinterIcon />
              Imprimir / PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function ReportBody({
  report,
  insight,
  loading,
}: {
  report: ReportResult;
  insight: string | null;
  loading: boolean;
}) {
  return (
    <div
      className={cn("space-y-3 transition-opacity", loading && "opacity-50")}
    >
      {insight ? (
        <div className="flex gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm leading-relaxed">
          <RhinoAvatar size={32} />
          <div className="min-w-0 flex-1">
            <p className="mb-1 font-medium">Lo que ve RHINO</p>
            <RhinoText text={insight} />
          </div>
        </div>
      ) : null}
      {report.notes.length ? (
        <ul className="space-y-0.5 text-muted-foreground text-xs">
          {report.notes.map((note) => (
            <li key={note}>· {note}</li>
          ))}
        </ul>
      ) : null}
      {report.factCount ? (
        <>
          <ReportKpis report={report} />
          <ReportChart
            key={`${report.spec.chart}-${report.measures.map((m) => m.key).join()}`}
            report={report}
          />
          {report.spec.groupBy ? <ReportTable report={report} /> : null}
          <p className="text-muted-foreground text-xs">
            {report.factCount.toLocaleString("es-AR")} registros
            {report.spec.groupBy
              ? ` · ${report.groupCount.toLocaleString("es-AR")} grupos`
              : ""}
          </p>
        </>
      ) : (
        <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground text-sm">
          No hay datos para este período o estos filtros. Probá con otro período
          o sacá algún filtro.
        </div>
      )}
    </div>
  );
}

export function ReportsTab() {
  const { snapshot } = useCommercialAi();
  const orgSlug = snapshot.orgSlug;
  const [home, setHome] = useState<ReportsHome | null>(null);
  const [homeError, setHomeError] = useState("");
  const [spec, setSpec] = useState<ReportSpec | null>(null);
  const [report, setReport] = useState<ReportResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [asking, startAsking] = useTransition();
  const [insight, setInsight] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [savedId, setSavedId] = useState<string | undefined>(undefined);
  const requestId = useRef(0);
  const skipRun = useRef(false);

  useEffect(() => {
    getReportsHomeAction(orgSlug).then((result) => {
      if (result.success) {
        setHome(result.data);
      } else {
        setHomeError(result.error);
      }
    });
  }, [orgSlug]);

  const datasets = useMemo(
    () => DATASETS.filter((d) => home?.datasets.includes(d.id)),
    [home]
  );
  const dataset = spec ? datasetById(spec.dataset) : undefined;

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
        setError(result.error);
      }
    },
    [orgSlug]
  );

  // Cada cambio en el constructor vuelve a calcular (con una pausa corta).
  useEffect(() => {
    if (!spec) {
      return;
    }
    if (skipRun.current) {
      skipRun.current = false;
      return;
    }
    setInsight(null);
    const timer = setTimeout(() => run(spec), RUN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [spec, run]);

  const open = (
    input: Partial<ReportSpec> & { dataset: string },
    id?: string
  ) => {
    const clean = sanitizeSpec(input);
    if (clean) {
      setReport(null);
      setSavedId(id);
      setSpec(clean);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const ask = (question: string) => {
    startAsking(async () => {
      setError("");
      const result = await askReportAction(orgSlug, question, spec);
      if (result.success) {
        skipRun.current = true;
        setSpec(result.report.spec);
        setReport(result.report);
        setInsight(null);
        setSavedId(undefined);
      } else {
        toast.error(result.error);
      }
    });
  };

  const explain = async () => {
    if (!spec) {
      return;
    }
    setExplaining(true);
    const result = await explainReportAction(orgSlug, spec);
    setExplaining(false);
    if (result.success) {
      setInsight(result.text);
    } else {
      toast.error(result.error);
    }
  };

  const save = async (name: string, shared: boolean) => {
    if (!spec) {
      return false;
    }
    const result = await saveReportAction(
      orgSlug,
      { name, shared, id: savedId },
      spec
    );
    if (!result.success) {
      toast.error(result.error);
      return false;
    }
    toast.success("Reporte guardado.");
    setHome((prev) => (prev ? { ...prev, saved: result.saved } : prev));
    setSpec((prev) => (prev ? { ...prev, title: name } : prev));
    skipRun.current = true;
    setReport((prev) => (prev ? { ...prev, title: name } : prev));
    return true;
  };

  const remove = async (saved: SavedReport) => {
    const result = await deleteReportAction(orgSlug, saved.id);
    if (result.success) {
      setHome((prev) => (prev ? { ...prev, saved: result.saved } : prev));
      toast.success("Reporte borrado.");
    } else {
      toast.error(result.error);
    }
  };

  if (homeError) {
    return (
      <p className="rounded-xl border p-6 text-muted-foreground text-sm">
        {homeError}
      </p>
    );
  }
  if (!home) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 rounded-xl" />
        <div className="grid gap-2 md:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton className="h-20 rounded-xl" key={i} />
          ))}
        </div>
      </div>
    );
  }
  if (!datasets.length) {
    return (
      <p className="rounded-xl border p-6 text-muted-foreground text-sm">
        Tu usuario no tiene permiso para ver datos en reportes. Pedile a un
        administrador que te dé acceso a ventas, compras o stock.
      </p>
    );
  }

  return (
    <div className="space-y-4 print:space-y-2">
      <div className="print:hidden">
        <AskBar
          aiEnabled={home.aiEnabled}
          inReport={Boolean(spec)}
          onAsk={ask}
          pending={asking}
        />
      </div>

      {spec && dataset ? (
        <div className="space-y-3">
          <ReportHeader
            aiEnabled={home.aiEnabled}
            dataset={dataset}
            explaining={explaining}
            onBack={() => {
              setSpec(null);
              setReport(null);
              setInsight(null);
            }}
            onExplain={explain}
            onSave={() => setSaveOpen(true)}
            report={report}
            spec={spec}
          />

          <div className="print:hidden">
            <ReportBuilder
              dataset={dataset}
              datasets={datasets}
              filterOptions={report?.filterOptions ?? {}}
              onChange={setSpec}
              spec={spec}
            />
          </div>

          {error ? (
            <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm">
              {error}
            </p>
          ) : null}

          {report ? (
            <ReportBody insight={insight} loading={loading} report={report} />
          ) : (
            <ReportSkeleton />
          )}
        </div>
      ) : (
        <Home datasets={datasets} home={home} onDelete={remove} onOpen={open} />
      )}

      <SaveDialog
        initialName={report?.title ?? ""}
        onOpenChange={setSaveOpen}
        onSave={save}
        open={saveOpen}
      />
    </div>
  );
}

"use client";

import {
  ArrowLeftIcon,
  PauseIcon,
  PencilSimpleIcon,
  PlayIcon,
  PlusIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  runCampaignAction,
  saveCampaignAction,
  setCampaignStatusAction,
} from "@/modules/commercial-ai/actions/prospecting.actions";
import { CAMPAIGN_STATUS, GOAL_KINDS } from "@/modules/commercial-ai/constants";
import { ASK_LABELS } from "@/modules/commercial-ai/engine/prospecting";
import type {
  CampaignRunView,
  CampaignStatus,
  CampaignView,
  ProspectView,
} from "@/modules/commercial-ai/types";
import { Chip } from "./opportunities-tab";
import {
  EmptyRow,
  formatDateTime,
  SectionCard,
  useCommercialAi,
} from "./shared";

const CONTACTED = new Set([
  "contactado",
  "en_conversacion",
  "esperando_pedido",
  "perdido",
]);
const ANSWERED = new Set(["en_conversacion", "esperando_pedido"]);
const MEETINGS = new Set(["esperando_pedido"]);
const GOAL_STAGES = {
  contactadas: CONTACTED,
  respuestas: ANSWERED,
  reuniones: MEETINGS,
} as const;
const RUN_STATUS_LABEL = {
  terminada: "Terminada",
  fallida: "Falló",
  corriendo: "Corriendo",
} as const;

function emptyCampaignsText(hasCampaigns: boolean, isManager: boolean): string {
  if (hasCampaigns) {
    return "No hay campañas con este filtro.";
  }
  return isManager
    ? "Todavía no hay campañas. Armá la primera con “Nueva campaña”."
    : "Todavía no tenés campañas asignadas.";
}

function toggleChannel(
  channels: CampaignView["channels"],
  channel: CampaignView["channels"][number]
): CampaignView["channels"] {
  if (!channels.includes(channel)) {
    return [...channels, channel];
  }
  const rest = channels.filter((c) => c !== channel);
  return rest.length ? rest : channels;
}

export function campaignProgress(
  campaign: CampaignView,
  prospects: ProspectView[]
): number {
  const mine = prospects.filter((p) => p.campaignId === campaign.id);
  const set = GOAL_STAGES[campaign.goalKind ?? "contactadas"];
  return mine.filter((p) => set.has(p.stage)).length;
}

type Mode =
  | { view: "lista" }
  | { view: "editar"; campaign: CampaignView | null }
  | { view: "corridas"; campaignId: string | null };

export function CampaignsTab() {
  const [mode, setMode] = useState<Mode>({ view: "lista" });
  if (mode.view === "editar") {
    return (
      <CampaignWizard
        campaign={mode.campaign}
        onDone={() => setMode({ view: "lista" })}
      />
    );
  }
  if (mode.view === "corridas") {
    return (
      <RunsView
        campaignId={mode.campaignId}
        onBack={() => setMode({ view: "lista" })}
      />
    );
  }
  return (
    <CampaignList
      onEdit={(campaign) => setMode({ view: "editar", campaign })}
      onRuns={(campaignId) => setMode({ view: "corridas", campaignId })}
    />
  );
}

/* ============ Listado ============ */

function CampaignList({
  onEdit,
  onRuns,
}: {
  onEdit: (campaign: CampaignView | null) => void;
  onRuns: (campaignId: string | null) => void;
}) {
  const { snapshot, isManager } = useCommercialAi();
  const { campaigns, prospects, runs, googlePlacesEnabled } =
    snapshot.prospecting;
  const [filter, setFilter] = useState<CampaignStatus | "todas">("todas");
  const [runFor, setRunFor] = useState<CampaignView | null>(null);
  const [pending, startTransition] = useTransition();
  const visible = campaigns.filter((c) =>
    filter === "todas" ? c.status !== "archivada" : c.status === filter
  );

  const run = (campaign: CampaignView, csvText?: string) =>
    startTransition(async () => {
      const result = await runCampaignAction(
        snapshot.orgSlug,
        campaign.id,
        csvText
      );
      if (result.success) {
        toast.success(
          `Corrida terminada: ${result.created ?? 0} prospectos nuevos.`
        );
        setRunFor(null);
      } else {
        toast.error(result.error);
      }
    });

  const toggle = (campaign: CampaignView) =>
    startTransition(async () => {
      const next = campaign.status === "activa" ? "pausada" : "activa";
      const result = await setCampaignStatusAction(
        snapshot.orgSlug,
        campaign.id,
        next
      );
      if (result.success) {
        toast.success(
          next === "activa" ? "Campaña activa." : "Campaña pausada."
        );
      } else {
        toast.error(result.error);
      }
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-heading text-xl">Campañas</h2>
        <div className="ml-auto flex gap-2">
          <Button onClick={() => onRuns(null)} size="sm" variant="outline">
            Corridas
          </Button>
          {isManager ? (
            <Button onClick={() => onEdit(null)} size="sm">
              <PlusIcon />
              Nueva campaña
            </Button>
          ) : null}
        </div>
      </div>

      {snapshot.aiEnabled && googlePlacesEnabled ? null : (
        <p className="rounded-md bg-muted px-3 py-2 text-muted-foreground text-sm">
          {snapshot.aiEnabled
            ? ""
            : "Sin IA activa: el encaje y los mensajes se arman con reglas. "}
          {googlePlacesEnabled
            ? ""
            : "Google Places no está configurado: por ahora las campañas usan listas propias (CSV)."}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {(["todas", "activa", "pausada", "borrador", "archivada"] as const).map(
          (status) => (
            <Chip
              active={filter === status}
              key={status}
              onClick={() => setFilter(status)}
            >
              {status === "todas" ? "Todas" : CAMPAIGN_STATUS[status].label}
            </Chip>
          )
        )}
      </div>

      {visible.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((campaign) => (
            <CampaignCard
              campaign={campaign}
              canRun={isManager || campaign.sellerId === snapshot.currentUserId}
              isManager={isManager}
              key={campaign.id}
              lastRun={runs.find((r) => r.campaignId === campaign.id) ?? null}
              onEdit={() => onEdit(campaign)}
              onRun={() =>
                campaign.source === "lista"
                  ? setRunFor(campaign)
                  : run(campaign)
              }
              onRuns={() => onRuns(campaign.id)}
              onToggle={() => toggle(campaign)}
              pending={pending}
              progress={campaignProgress(campaign, prospects)}
              total={
                prospects.filter((p) => p.campaignId === campaign.id).length
              }
            />
          ))}
        </div>
      ) : (
        <Card className="p-6 text-center text-muted-foreground text-sm">
          {emptyCampaignsText(campaigns.length > 0, isManager)}
        </Card>
      )}

      {runFor ? (
        <CsvRunPanel
          campaign={runFor}
          onCancel={() => setRunFor(null)}
          onRun={(csv) => run(runFor, csv)}
          pending={pending}
        />
      ) : null}
    </div>
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: tarjeta con acciones según rol y estado de la campaña
function CampaignCard({
  campaign,
  canRun,
  isManager,
  pending,
  progress,
  lastRun,
  total,
  onRun,
  onRuns,
  onEdit,
  onToggle,
}: {
  campaign: CampaignView;
  canRun: boolean;
  isManager: boolean;
  pending: boolean;
  progress: number;
  lastRun: CampaignRunView | null;
  total: number;
  onRun: () => void;
  onRuns: () => void;
  onEdit: () => void;
  onToggle: () => void;
}) {
  const ratio = campaign.goalCount
    ? Math.min(1, progress / campaign.goalCount)
    : 0;
  return (
    <Card className="gap-3 p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{campaign.name}</p>
          <p className="text-muted-foreground text-xs">
            {campaign.goalCount && campaign.goalKind
              ? `${campaign.goalCount} ${GOAL_KINDS[campaign.goalKind]}`
              : "Sin objetivo"}
          </p>
        </div>
        <Badge
          className={cn(
            "border-transparent",
            CAMPAIGN_STATUS[campaign.status].className
          )}
        >
          {CAMPAIGN_STATUS[campaign.status].label}
        </Badge>
      </div>
      {campaign.goalCount ? (
        <div>
          <div className="flex justify-between text-xs tabular-nums">
            <span>
              {progress}/{campaign.goalCount}
            </span>
            <span>{Math.round(ratio * 100)} %</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary"
              style={{ width: `${ratio * 100}%` }}
            />
          </div>
        </div>
      ) : null}
      <div className="space-y-0.5 text-muted-foreground text-xs">
        <p>
          Última corrida:{" "}
          {lastRun
            ? `${formatDateTime(lastRun.startedAt)} · ${lastRun.createdCount} prospectos`
            : "nunca"}
        </p>
        <p>
          {total} prospectos · fuente:{" "}
          {campaign.source === "lista" ? "lista propia" : "Google Places"}
          {campaign.zones.length ? ` · ${campaign.zones.join(", ")}` : ""}
        </p>
      </div>
      <div className="mt-auto flex flex-wrap gap-2 border-t pt-3">
        {canRun && campaign.status !== "archivada" ? (
          <Button disabled={pending} onClick={onRun} size="sm">
            <PlayIcon />
            Correr
          </Button>
        ) : null}
        <Button onClick={onRuns} size="sm" variant="ghost">
          Ver corridas
        </Button>
        {isManager ? (
          <>
            <Button
              aria-label="Editar"
              onClick={onEdit}
              size="icon"
              variant="ghost"
            >
              <PencilSimpleIcon />
            </Button>
            {campaign.status === "activa" || campaign.status === "pausada" ? (
              <Button
                aria-label={campaign.status === "activa" ? "Pausar" : "Activar"}
                disabled={pending}
                onClick={onToggle}
                size="icon"
                variant="ghost"
              >
                {campaign.status === "activa" ? <PauseIcon /> : <PlayIcon />}
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
    </Card>
  );
}

function CsvRunPanel({
  campaign,
  pending,
  onRun,
  onCancel,
}: {
  campaign: CampaignView;
  pending: boolean;
  onRun: (csv: string) => void;
  onCancel: () => void;
}) {
  const [csv, setCsv] = useState("");
  return (
    <Card className="gap-3 p-4">
      <div className="flex items-center gap-2">
        <p className="font-semibold">Correr {campaign.name}</p>
        <Button
          aria-label="Cerrar"
          className="ml-auto"
          onClick={onCancel}
          size="icon"
          variant="ghost"
        >
          <XIcon />
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">
        Subí o pegá tu lista (CSV o copiado de Excel). Necesita una columna{" "}
        <b>nombre</b>; si tiene rubro, localidad, teléfono, email o web, mejor.
      </p>
      <Input
        accept=".csv,.txt,text/csv"
        aria-label="Archivo CSV"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) {
            setCsv(await file.text());
          }
        }}
        type="file"
      />
      <Textarea
        aria-label="Lista pegada"
        className="font-mono text-xs"
        onChange={(e) => setCsv(e.target.value)}
        placeholder={
          "nombre;rubro;localidad;telefono\nPizzería Napoli;pizzería;Resistencia;3624 555555"
        }
        rows={6}
        value={csv}
      />
      <div className="flex justify-end">
        <Button disabled={pending || !csv.trim()} onClick={() => onRun(csv)}>
          {pending ? "Corriendo…" : "Correr campaña"}
        </Button>
      </div>
    </Card>
  );
}

/* ============ Corridas ============ */

function RunsView({
  campaignId,
  onBack,
}: {
  campaignId: string | null;
  onBack: () => void;
}) {
  const { snapshot } = useCommercialAi();
  const { runs, campaigns } = snapshot.prospecting;
  const list = runs.filter((r) => !campaignId || r.campaignId === campaignId);
  const name = (id: string) =>
    campaigns.find((c) => c.id === id)?.name ?? "Campaña";
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          aria-label="Volver"
          onClick={onBack}
          size="icon"
          variant="ghost"
        >
          <ArrowLeftIcon />
        </Button>
        <h2 className="font-heading text-xl">
          Corridas{campaignId ? ` · ${name(campaignId)}` : ""}
        </h2>
      </div>
      <SectionCard title="Historial">
        {list.length ? (
          list.map((run) => (
            <details className="border-t px-4 py-3" key={run.id}>
              <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                <span className="font-medium">{name(run.campaignId)}</span>
                <span className="text-muted-foreground text-sm">
                  {formatDateTime(run.startedAt)}
                </span>
                <Badge
                  variant={
                    run.status === "fallida" ? "destructive" : "secondary"
                  }
                >
                  {RUN_STATUS_LABEL[run.status]}
                </Badge>
                <span className="ml-auto text-muted-foreground text-sm tabular-nums">
                  {run.found} relevados · {run.discarded} descartados ·{" "}
                  {run.createdCount} nuevos
                  {run.usedAi ? " · con IA" : ""}
                </span>
              </summary>
              <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-muted-foreground text-sm">
                {run.log.map((line, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: el log no tiene ids
                  <li key={i}>{line}</li>
                ))}
              </ol>
              {run.error ? (
                <p className="mt-1 text-destructive text-sm">{run.error}</p>
              ) : null}
            </details>
          ))
        ) : (
          <EmptyRow>Todavía no hay corridas.</EmptyRow>
        )}
      </SectionCard>
    </div>
  );
}

/* ============ Asistente de campaña (5 pasos) ============ */

const STEPS = [
  "Configuración",
  "A quién",
  "Por dónde",
  "El mensaje",
  "Resumen",
] as const;
const AFFINITY_PRESETS = [
  { label: "Estricto", value: 80 },
  { label: "Normal", value: 40 },
  { label: "Amplio", value: 1 },
] as const;
const COUNTRIES = [
  "Argentina",
  "Bolivia",
  "Brasil",
  "Chile",
  "Colombia",
  "Ecuador",
  "España",
  "México",
  "Paraguay",
  "Perú",
  "Uruguay",
];

type Draft = Omit<CampaignView, "id"> & { id?: string };

function emptyDraft(today: string, sellerId: string | null): Draft {
  return {
    name: "",
    sellerId,
    status: "borrador",
    goalCount: null,
    goalKind: null,
    startDate: today,
    endDate: null,
    affinityMin: 40,
    maxPerRun: 20,
    icpId: null,
    persona: null,
    source: "lista",
    country: "Argentina",
    zones: [],
    exclusions: [],
    entryStrategy: "ia",
    catalogUrl: null,
    ask: "responder",
    channels: ["whatsapp"],
    notes: "",
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: asistente de cinco pasos con un solo borrador
function CampaignWizard({
  campaign,
  onDone,
}: {
  campaign: CampaignView | null;
  onDone: () => void;
}) {
  const { snapshot } = useCommercialAi();
  const { icps, googlePlacesEnabled } = snapshot.prospecting;
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(
    campaign ?? emptyDraft(snapshot.today, snapshot.sellers[0]?.id ?? null)
  );
  const [zone, setZone] = useState("");
  const [exclusionsText, setExclusionsText] = useState(
    draft.exclusions.join("\n")
  );
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));
  const icp = icps.find((i) => i.id === draft.icpId) ?? null;

  const canAdvance = step !== 0 || draft.name.trim().length > 0;

  const save = (status: CampaignStatus) =>
    startTransition(async () => {
      const result = await saveCampaignAction(snapshot.orgSlug, {
        ...draft,
        status,
        exclusions: exclusionsText
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean),
        catalogUrl: draft.catalogUrl?.trim() || null,
        persona: draft.persona || null,
      });
      if (result.success) {
        toast.success(
          status === "borrador"
            ? "Guardada como borrador."
            : "Campaña guardada."
        );
        onDone();
      } else {
        toast.error(result.error);
      }
    });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-2">
        <Button
          aria-label="Volver"
          onClick={onDone}
          size="icon"
          variant="ghost"
        >
          <ArrowLeftIcon />
        </Button>
        <h2 className="font-heading text-xl">
          {campaign ? campaign.name : "Nueva campaña"}
        </h2>
      </div>
      <ol className="flex flex-wrap gap-2 text-sm">
        {STEPS.map((label, index) => (
          <li key={label}>
            <button
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1",
                index === step
                  ? "bg-primary/10 font-medium"
                  : "text-muted-foreground hover:bg-muted"
              )}
              disabled={!(canAdvance || index <= step)}
              onClick={() => setStep(index)}
              type="button"
            >
              <span className="grid size-5 place-items-center rounded-full border text-xs">
                {index + 1}
              </span>
              {label}
            </button>
          </li>
        ))}
      </ol>

      <Card className="gap-0 divide-y p-0">
        {step === 0 ? (
          <>
            <Field hint="Cómo vas a reconocerla en la lista." label="Nombre">
              <Input
                onChange={(e) => set("name", e.target.value)}
                placeholder="Ej: Pizzerías · Gran Resistencia"
                value={draft.name}
              />
            </Field>
            <Field
              hint="Los prospectos que traiga van a ser suyos."
              label="Vendedor"
            >
              <Select
                onValueChange={(v) => set("sellerId", v === "none" ? null : v)}
                value={draft.sellerId ?? "none"}
              >
                <SelectTrigger aria-label="Vendedor">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {snapshot.sellers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="none">Sin vendedor</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field
              hint="Una meta comprobable: cuántos y de qué."
              label="Objetivo"
            >
              <div className="flex gap-2">
                <Input
                  aria-label="Cantidad"
                  className="w-24"
                  inputMode="numeric"
                  onChange={(e) =>
                    set("goalCount", Number(e.target.value) || null)
                  }
                  placeholder="Ej: 50"
                  value={draft.goalCount ?? ""}
                />
                <Select
                  onValueChange={(v) => set("goalKind", v as Draft["goalKind"])}
                  value={draft.goalKind ?? ""}
                >
                  <SelectTrigger
                    aria-label="Tipo de objetivo"
                    className="flex-1"
                  >
                    <SelectValue placeholder="Elegí…" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(GOAL_KINDS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label.charAt(0).toUpperCase() + label.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Field>
            <Field label="Fechas">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  aria-label="Inicio"
                  className="w-44"
                  onChange={(e) => set("startDate", e.target.value)}
                  type="date"
                  value={draft.startDate}
                />
                <span className="text-muted-foreground text-sm">hasta</span>
                <Input
                  aria-label="Fin"
                  className="w-44"
                  onChange={(e) => set("endDate", e.target.value || null)}
                  type="date"
                  value={draft.endDate ?? ""}
                />
                <span className="text-muted-foreground text-xs">
                  (vacío = sin fecha de fin)
                </span>
              </div>
            </Field>
            <Field
              hint="Qué tan parecido al ideal tiene que ser un comercio para que lo tomemos."
              label="Afinidad mínima"
            >
              <div className="flex flex-wrap items-center gap-2">
                {AFFINITY_PRESETS.map((preset) => (
                  <Chip
                    active={draft.affinityMin === preset.value}
                    key={preset.value}
                    onClick={() => set("affinityMin", preset.value)}
                  >
                    {preset.label} ({preset.value})
                  </Chip>
                ))}
                <Input
                  aria-label="Afinidad personalizada"
                  className="w-20"
                  max={100}
                  min={1}
                  onChange={(e) =>
                    set(
                      "affinityMin",
                      Math.min(100, Math.max(1, Number(e.target.value) || 1))
                    )
                  }
                  type="number"
                  value={draft.affinityMin}
                />
              </div>
            </Field>
            <Field
              hint="Cuántos prospectos suma cada corrida como máximo."
              label="Tope por corrida"
            >
              <Input
                aria-label="Tope por corrida"
                className="w-24"
                max={200}
                min={1}
                onChange={(e) =>
                  set(
                    "maxPerRun",
                    Math.min(200, Math.max(1, Number(e.target.value) || 1))
                  )
                }
                type="number"
                value={draft.maxPerRun}
              />
            </Field>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Field
              hint="El perfil de cliente ideal al que apunta. Se arman en Configuración → Prospección."
              label="¿A quién le vendemos?"
            >
              {icps.length ? (
                <div className="grid gap-2 md:grid-cols-2">
                  {icps.map((item) => (
                    <button
                      aria-pressed={draft.icpId === item.id}
                      className={cn(
                        "rounded-lg border p-3 text-left text-sm",
                        draft.icpId === item.id
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted"
                      )}
                      key={item.id}
                      onClick={() =>
                        setDraft((prev) => ({
                          ...prev,
                          icpId: item.id,
                          persona: item.personas[0] ?? null,
                        }))
                      }
                      type="button"
                    >
                      <p className="font-medium">{item.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {item.description}
                      </p>
                      <p className="mt-1 text-muted-foreground text-xs">
                        Busca: {item.keywords.join(", ")}
                      </p>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Todavía no hay perfiles. Creá uno en Configuración →
                  Prospección para que la búsqueda y el encaje funcionen bien.
                </p>
              )}
            </Field>
            {icp?.personas.length ? (
              <Field
                hint="El rol al que le habla el mensaje."
                label="¿A quién le hablamos?"
              >
                <Select
                  onValueChange={(v) => set("persona", v)}
                  value={draft.persona ?? ""}
                >
                  <SelectTrigger aria-label="Persona">
                    <SelectValue placeholder="Elegí una persona" />
                  </SelectTrigger>
                  <SelectContent>
                    {icp.personas.map((persona) => (
                      <SelectItem key={persona} value={persona}>
                        {persona}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Field hint="De dónde sacamos los comercios." label="Fuente">
              <div className="grid gap-2 md:grid-cols-2">
                <SourceCard
                  active={draft.source === "lista"}
                  description="Tu propio Excel o padrón: lo subís o pegás al correr."
                  onClick={() => set("source", "lista")}
                  title="Lista propia"
                />
                <SourceCard
                  active={draft.source === "google_places"}
                  description={
                    googlePlacesEnabled
                      ? "Comercios de Google Maps por rubro, en las zonas que elijas."
                      : "Falta configurar GOOGLE_PLACES_API_KEY."
                  }
                  disabled={!googlePlacesEnabled}
                  onClick={() => set("source", "google_places")}
                  title="Google Places"
                />
              </div>
            </Field>
            <Field label="País">
              <Select
                onValueChange={(v) => set("country", v)}
                value={draft.country}
              >
                <SelectTrigger aria-label="País" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((country) => (
                    <SelectItem key={country} value={country}>
                      {country}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              hint="Una ciudad, barrio o localidad. Podés sumar varias."
              label="Zonas"
            >
              <div className="space-y-2">
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (zone.trim()) {
                      set("zones", [...draft.zones, zone.trim()]);
                      setZone("");
                    }
                  }}
                >
                  <Input
                    aria-label="Agregar zona"
                    onChange={(e) => setZone(e.target.value)}
                    placeholder="Ej: Resistencia, Chaco"
                    value={zone}
                  />
                  <Button type="submit" variant="outline">
                    Agregar
                  </Button>
                </form>
                <div className="flex flex-wrap gap-2">
                  {draft.zones.map((z) => (
                    <Badge className="gap-1" key={z} variant="secondary">
                      {z}
                      <button
                        aria-label={`Quitar ${z}`}
                        onClick={() =>
                          set(
                            "zones",
                            draft.zones.filter((x) => x !== z)
                          )
                        }
                        type="button"
                      >
                        <XIcon className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            </Field>
            <Field
              hint="Cadenas, competidores o comercios que esta campaña no tiene que tocar. Uno por línea. Los clientes actuales ya se excluyen solos."
              label="Excluir"
            >
              <Textarea
                onChange={(e) => setExclusionsText(e.target.value)}
                placeholder={"Carrefour\nLa Anónima"}
                rows={4}
                value={exclusionsText}
              />
            </Field>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <Field
              hint="Lo que acompaña al primer mensaje."
              label="Estrategia de entrada"
            >
              <div className="grid gap-2 md:grid-cols-2">
                <SourceCard
                  active={draft.entryStrategy === "catalogo"}
                  description="Pegás el link de tu catálogo y el mensaje lo incluye."
                  onClick={() => set("entryStrategy", "catalogo")}
                  title="Catálogo general"
                />
                <SourceCard
                  active={draft.entryStrategy === "ia"}
                  description="La IA arma el gancho para cada comercio con lo que sabe de él."
                  onClick={() => set("entryStrategy", "ia")}
                  title="La IA decide cómo entrar"
                />
              </div>
              {draft.entryStrategy === "catalogo" ? (
                <Input
                  className="mt-2"
                  onChange={(e) => set("catalogUrl", e.target.value)}
                  placeholder="https://…"
                  value={draft.catalogUrl ?? ""}
                />
              ) : null}
            </Field>
            <Field
              hint="La acción concreta que pide el mensaje."
              label="¿Qué pedís?"
            >
              <div className="grid gap-2 md:grid-cols-2">
                {(Object.keys(ASK_LABELS) as CampaignView["ask"][]).map(
                  (ask) => (
                    <SourceCard
                      active={draft.ask === ask}
                      description=""
                      key={ask}
                      onClick={() => set("ask", ask)}
                      title={ASK_LABELS[ask]}
                    />
                  )
                )}
              </div>
            </Field>
            <Field
              hint="Hoy vos revisás y enviás cada mensaje desde la ficha del prospecto."
              label="Canal"
            >
              <div className="flex gap-2">
                {(["whatsapp", "email"] as const).map((channel) => (
                  <Chip
                    active={draft.channels.includes(channel)}
                    key={channel}
                    onClick={() =>
                      set("channels", toggleChannel(draft.channels, channel))
                    }
                  >
                    {channel === "whatsapp" ? "WhatsApp" : "Email"}
                  </Chip>
                ))}
              </div>
            </Field>
            <Field
              hint="Cualquier cosa para el primer contacto: promo, tono, qué no decir."
              label="Indicaciones"
            >
              <Textarea
                onChange={(e) => set("notes", e.target.value)}
                rows={3}
                value={draft.notes}
              />
            </Field>
          </>
        ) : null}

        {step === 4 ? (
          <div className="space-y-2 p-4 text-sm">
            <SummaryRow label="Nombre" value={draft.name || "—"} />
            <SummaryRow
              label="Vendedor"
              value={
                snapshot.sellers.find((s) => s.id === draft.sellerId)?.name ??
                "Sin vendedor"
              }
            />
            <SummaryRow
              label="Objetivo"
              value={
                draft.goalCount && draft.goalKind
                  ? `${draft.goalCount} ${GOAL_KINDS[draft.goalKind]}`
                  : "Sin objetivo"
              }
            />
            <SummaryRow
              label="Perfil"
              value={
                icp
                  ? `${icp.name}${draft.persona ? ` · le hablamos a ${draft.persona}` : ""}`
                  : "Sin perfil"
              }
            />
            <SummaryRow
              label="Fuente"
              value={`${draft.source === "lista" ? "Lista propia" : "Google Places"} · ${draft.country}${draft.zones.length ? ` · ${draft.zones.join(", ")}` : ""}`}
            />
            <SummaryRow
              label="Afinidad y tope"
              value={`Mínimo ${draft.affinityMin} · hasta ${draft.maxPerRun} por corrida`}
            />
            <SummaryRow
              label="Mensaje"
              value={`${draft.entryStrategy === "catalogo" ? "Con catálogo" : "Gancho armado por IA"} · ${ASK_LABELS[draft.ask]}`}
            />
            <SummaryRow
              label="IA"
              value={
                snapshot.aiEnabled
                  ? `Activa (${snapshot.aiModel})`
                  : "Apagada: encaje y mensaje por reglas"
              }
            />
          </div>
        ) : null}

        <div className="flex flex-wrap justify-between gap-2 p-4">
          <Button
            disabled={step === 0}
            onClick={() => setStep((s) => s - 1)}
            variant="ghost"
          >
            Atrás
          </Button>
          <div className="flex gap-2">
            <Button
              disabled={pending || !draft.name.trim()}
              onClick={() =>
                save(
                  campaign?.status === "activa" ||
                    campaign?.status === "pausada"
                    ? campaign.status
                    : "borrador"
                )
              }
              variant="outline"
            >
              {campaign && campaign.status !== "borrador"
                ? "Guardar cambios"
                : "Guardar como borrador"}
            </Button>
            {step < STEPS.length - 1 ? (
              <Button
                disabled={!canAdvance}
                onClick={() => setStep((s) => s + 1)}
              >
                Siguiente
              </Button>
            ) : (
              <Button
                disabled={pending || !draft.name.trim()}
                onClick={() => save("activa")}
              >
                Activar campaña
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2 p-4">
      <div>
        <p className="font-medium text-sm">{label}</p>
        {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

function SourceCard({
  title,
  description,
  active,
  disabled,
  onClick,
}: {
  title: string;
  description: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "rounded-lg border p-3 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50",
        active ? "border-primary bg-primary/5" : "hover:bg-muted"
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <p className="font-medium">{title}</p>
      {description ? (
        <p className="text-muted-foreground text-xs">{description}</p>
      ) : null}
    </button>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

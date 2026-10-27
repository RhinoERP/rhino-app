import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin-client";
import { computePatterns } from "../engine/learnings";
import {
  dedupeKey,
  filterCandidates,
  parseProspectCsv,
  type RawProspect,
  ruleFitScore,
  type ScoredProspect,
  templateMessage,
} from "../engine/prospecting";
import {
  type CampaignRunView,
  type CampaignView,
  type CheckinView,
  DEFAULT_ROUTE_SETTINGS,
  type IcpView,
  type LearningView,
  type OpportunityView,
  type ProspectEventView,
  type ProspectingSnapshot,
  type ProspectView,
  type RouteSettings,
  type RouteStartView,
  type RouteStopView,
  type RouteView,
  type TerritoryView,
} from "../types";
import { createAiMessage, isAiEnabled } from "./ai-client";
import type { CommercialAiAccess } from "./commercial-ai.service";
import { isGooglePlacesEnabled, searchPlaces } from "./places.service";
import { AiBudgetExceededError, type AiMeter } from "./usage.service";

type AdminClient = ReturnType<typeof createAdminClient>;

const ROUTE_HISTORY_DAYS = 70;
const MAX_AI_CANDIDATES = 40;
const MAX_PLACES_QUERIES = 6;
const MS_PER_DAY = 86_400_000;

/* ============ Lectura ============ */

async function optionalRows<T>(
  query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const { data, error } = await query;
  if (error) {
    console.warn(`IA Comercial (prospección): ${error.message}`);
    return [];
  }
  return data ?? [];
}

type Row = Record<string, unknown>;

const str = (value: unknown): string | null =>
  typeof value === "string" ? value : null;
const arr = (value: unknown): string[] =>
  Array.isArray(value) ? (value as string[]) : [];

function mapCampaign(row: Row): CampaignView {
  return {
    id: row.id as string,
    name: row.name as string,
    sellerId: str(row.seller_id),
    status: row.status as CampaignView["status"],
    goalCount: (row.goal_count as number | null) ?? null,
    goalKind: (row.goal_kind as CampaignView["goalKind"]) ?? null,
    startDate: row.start_date as string,
    endDate: str(row.end_date),
    affinityMin: row.affinity_min as number,
    maxPerRun: row.max_per_run as number,
    icpId: str(row.icp_id),
    persona: str(row.persona),
    source: row.source as CampaignView["source"],
    country: row.country as string,
    zones: arr(row.zones),
    exclusions: arr(row.exclusions),
    entryStrategy: row.entry_strategy as CampaignView["entryStrategy"],
    catalogUrl: str(row.catalog_url),
    ask: row.ask as CampaignView["ask"],
    channels: arr(row.channels) as CampaignView["channels"],
    notes: (row.notes as string) ?? "",
  };
}

function mapProspect(row: Row): ProspectView {
  return {
    id: row.id as string,
    campaignId: str(row.campaign_id),
    sellerId: str(row.seller_id),
    name: row.name as string,
    category: str(row.category),
    address: str(row.address),
    city: str(row.city),
    province: str(row.province),
    phone: str(row.phone),
    email: str(row.email),
    website: str(row.website),
    source: row.source as string,
    fitScore: row.fit_score as number,
    fitReasons: (row.fit_reasons as string) ?? "",
    stage: row.stage as ProspectView["stage"],
    message: (row.message as string) ?? "",
    nextStep: str(row.next_step),
    nextStepDate: str(row.next_step_date),
    customerId: str(row.customer_id),
    createdAt: row.created_at as string,
  };
}

function mapIcp(row: Row): IcpView {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) ?? "",
    keywords: arr(row.keywords),
    personas: arr(row.personas),
    valueProposition: (row.value_proposition as string) ?? "",
  };
}

export function readRouteSettings(
  config: Record<string, unknown>
): RouteSettings {
  const routes = (config.routes ?? {}) as Partial<RouteSettings>;
  return {
    tope:
      typeof routes.tope === "number"
        ? routes.tope
        : DEFAULT_ROUTE_SETTINGS.tope,
    orden:
      Array.isArray(routes.orden) && routes.orden.length === 4
        ? routes.orden
        : DEFAULT_ROUTE_SETTINGS.orden,
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: arma toda la vista de prospección y rutas en un paso
export async function loadProspectingSnapshot(params: {
  admin: AdminClient;
  access: CommercialAiAccess;
  rawConfig: Record<string, unknown>;
  today: string;
  customerNames: Map<string, { name: string; city: string | null }>;
  opportunities: OpportunityView[];
}): Promise<ProspectingSnapshot> {
  const { admin, access, today } = params;
  const org = access.organizationId;
  const isManager = access.role === "gerente";
  const since = new Date(
    new Date(`${today}T12:00:00Z`).getTime() - ROUTE_HISTORY_DAYS * MS_PER_DAY
  )
    .toISOString()
    .slice(0, 10);

  const [
    territories,
    starts,
    routes,
    stops,
    icps,
    campaigns,
    runs,
    prospects,
    events,
    learnings,
    checkins,
  ] = await Promise.all([
    optionalRows<Row>(
      admin
        .from("commercial_ai_territories")
        .select("*")
        .eq("organization_id", org)
        .order("name")
    ),
    optionalRows<Row>(
      admin
        .from("commercial_ai_route_starts")
        .select("*")
        .eq("organization_id", org)
        .order("name")
    ),
    optionalRows<Row>(
      admin
        .from("commercial_ai_routes")
        .select("*")
        .eq("organization_id", org)
        .gte("route_date", since)
        .order("route_date", { ascending: false })
    ),
    optionalRows<Row>(
      admin
        .from("commercial_ai_route_stops")
        .select("*")
        .eq("organization_id", org)
        .order("position")
    ),
    optionalRows<Row>(
      admin
        .from("commercial_ai_icps")
        .select("*")
        .eq("organization_id", org)
        .order("name")
    ),
    optionalRows<Row>(
      admin
        .from("commercial_ai_campaigns")
        .select("*")
        .eq("organization_id", org)
        .order("created_at", { ascending: false })
    ),
    optionalRows<Row>(
      admin
        .from("commercial_ai_campaign_runs")
        .select("*")
        .eq("organization_id", org)
        .order("started_at", { ascending: false })
        .limit(100)
    ),
    optionalRows<Row>(
      admin
        .from("commercial_ai_prospects")
        .select("*")
        .eq("organization_id", org)
        .order("fit_score", { ascending: false })
        .limit(2000)
    ),
    optionalRows<Row>(
      admin
        .from("commercial_ai_prospect_events")
        .select("*")
        .eq("organization_id", org)
        .order("created_at", { ascending: false })
        .limit(2000)
    ),
    optionalRows<Row>(
      admin
        .from("commercial_ai_learnings")
        .select("*")
        .eq("organization_id", org)
        .order("created_at", { ascending: false })
    ),
    optionalRows<Row>(
      (() => {
        let query = admin
          .from("commercial_ai_checkins")
          .select("*")
          .eq("organization_id", org)
          .gte("created_at", `${since}T00:00:00Z`)
          .order("created_at", { ascending: false })
          .limit(5000);
        // El vendedor ve solo sus propios registros.
        if (!isManager) {
          query = query.eq("user_id", access.userId);
        }
        return query;
      })()
    ),
  ]);

  const visibleSeller = (sellerId: string | null) =>
    isManager || sellerId === access.userId;

  const prospectViews = prospects
    .map(mapProspect)
    .filter((p) => visibleSeller(p.sellerId));
  const prospectById = new Map(prospectViews.map((p) => [p.id, p]));
  const allProspectById = new Map(
    prospects.map((p) => [p.id as string, mapProspect(p)])
  );

  const stopsByRoute = new Map<string, RouteStopView[]>();
  for (const stop of stops) {
    const customerId = str(stop.customer_id);
    const prospectId = str(stop.prospect_id);
    const customer = customerId ? params.customerNames.get(customerId) : null;
    const prospect = prospectId ? allProspectById.get(prospectId) : null;
    const view: RouteStopView = {
      id: stop.id as string,
      position: stop.position as number,
      kind: customerId ? "cliente" : "prospecto",
      accountId: (customerId ?? prospectId) as string,
      name: customer?.name ?? prospect?.name ?? "Cuenta",
      city: customer?.city ?? prospect?.city ?? null,
      address: prospect?.address ?? null,
      reason: (stop.reason as string) ?? "",
      result: (stop.result as RouteStopView["result"]) ?? null,
      note: (stop.note as string) ?? "",
      resultAt: str(stop.result_at),
    };
    const list = stopsByRoute.get(stop.route_id as string) ?? [];
    list.push(view);
    stopsByRoute.set(stop.route_id as string, list);
  }

  const routeViews: RouteView[] = routes
    .map((route) => ({
      id: route.id as string,
      sellerId: str(route.seller_id),
      date: route.route_date as string,
      territoryId: str(route.territory_id),
      places: arr(route.places),
      startLabel: str(route.start_label),
      createdByName: str(route.created_by_name),
      stops: (stopsByRoute.get(route.id as string) ?? []).sort(
        (a, b) => a.position - b.position
      ),
    }))
    .filter((route) => visibleSeller(route.sellerId));

  const campaignViews = campaigns
    .map(mapCampaign)
    .filter((c) => visibleSeller(c.sellerId));
  const campaignIds = new Set(campaignViews.map((c) => c.id));

  const runViews: CampaignRunView[] = runs
    .filter((run) => campaignIds.has(run.campaign_id as string))
    .map((run) => ({
      id: run.id as string,
      campaignId: run.campaign_id as string,
      status: run.status as CampaignRunView["status"],
      found: run.found as number,
      discarded: run.discarded as number,
      createdCount: run.created_count as number,
      usedAi: Boolean(run.used_ai),
      log: Array.isArray(run.log) ? (run.log as string[]) : [],
      error: str(run.error),
      startedAt: run.started_at as string,
      finishedAt: str(run.finished_at),
    }));

  const eventViews: ProspectEventView[] = events
    .filter((event) => prospectById.has(event.prospect_id as string))
    .map((event) => ({
      id: event.id as string,
      prospectId: event.prospect_id as string,
      kind: event.kind as ProspectEventView["kind"],
      body: event.body as string,
      actorName: str(event.actor_name),
      createdAt: event.created_at as string,
    }));

  const learningViews: LearningView[] = learnings.map((row) => ({
    id: row.id as string,
    kind: row.kind as LearningView["kind"],
    title: row.title as string,
    body: (row.body as string) ?? "",
    status: row.status as LearningView["status"],
    actorName: str(row.actor_name),
    createdAt: row.created_at as string,
  }));

  const memoryOn = params.rawConfig.memoryOn === true;

  return {
    routeSettings: readRouteSettings(params.rawConfig),
    memoryOn,
    territories: territories.map(
      (row): TerritoryView => ({
        id: row.id as string,
        name: row.name as string,
        places: arr(row.places),
        sellerIds: arr(row.seller_ids),
      })
    ),
    routeStarts: starts.map(
      (row): RouteStartView => ({
        id: row.id as string,
        name: row.name as string,
        address: row.address as string,
        isDefault: Boolean(row.is_default),
      })
    ),
    routes: routeViews,
    icps: icps.map(mapIcp),
    campaigns: campaignViews,
    runs: runViews,
    prospects: prospectViews,
    prospectEvents: eventViews,
    learnings: learningViews,
    checkins: checkins.map((row): CheckinView => {
      const customerId = str(row.customer_id);
      const prospectId = str(row.prospect_id);
      const customer = customerId ? params.customerNames.get(customerId) : null;
      const prospect = prospectId ? allProspectById.get(prospectId) : null;
      const num = (value: unknown) =>
        value === null || value === undefined ? null : Number(value);
      return {
        id: row.id as string,
        userId: str(row.user_id),
        userName: str(row.user_name),
        routeId: str(row.route_id),
        stopId: str(row.stop_id),
        kind: customerId ? "cliente" : "prospecto",
        accountId: (customerId ?? prospectId) as string,
        accountName: customer?.name ?? prospect?.name ?? "Cuenta",
        accountCity: customer?.city ?? prospect?.city ?? null,
        result: (row.result as CheckinView["result"]) ?? null,
        note: (row.note as string) ?? "",
        latitude: num(row.latitude),
        longitude: num(row.longitude),
        accuracyM: num(row.accuracy_m),
        locationError: str(row.location_error),
        capturedAt: str(row.captured_at),
        createdAt: row.created_at as string,
      };
    }),
    patterns: memoryOn
      ? computePatterns({
          opportunities: params.opportunities,
          prospects: prospectViews,
          routes: routeViews,
        })
      : [],
    googlePlacesEnabled: isGooglePlacesEnabled(),
  };
}

/* ============ Corrida de una campaña ============ */

const scoringSchema = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          fit_score: { type: "integer" },
          reasons: { type: "string" },
          message: { type: "string" },
        },
        required: ["index", "fit_score", "reasons", "message"],
        additionalProperties: false,
      },
    },
  },
  required: ["results"],
  additionalProperties: false,
};

type AiScore = {
  index: number;
  fit_score: number;
  reasons: string;
  message: string;
};

const ASK_FOR_AI: Record<CampaignView["ask"], string> = {
  responder: "que responda si le interesa conversar",
  diagnostico: "que acepte una revisión gratis de lo que compra hoy",
  reunion: "que agende una llamada corta esta semana",
  visita: "que reciba una visita en el local esta semana",
};

async function scoreWithAi(params: {
  meter: AiMeter;
  candidates: RawProspect[];
  campaign: CampaignView;
  icp: IcpView | null;
  orgName: string;
  sellerName: string;
}): Promise<Map<number, AiScore> | null> {
  const { campaign, icp } = params;
  const system = `Sos el equipo de prospección de ${params.orgName}, una distribuidora mayorista argentina. Evaluás comercios candidatos para una campaña y escribís el primer mensaje de WhatsApp.
Perfil de cliente ideal: ${icp ? `${icp.name}. ${icp.description}` : "comercios minoristas que puedan revender o usar nuestros productos"}.
${icp?.valueProposition ? `Propuesta de valor: ${icp.valueProposition}.` : ""}
${campaign.persona ? `Le hablamos a: ${campaign.persona}.` : ""}
${campaign.entryStrategy === "catalogo" && campaign.catalogUrl ? `Incluí el link del catálogo: ${campaign.catalogUrl}.` : ""}
Acción que pide el mensaje: ${ASK_FOR_AI[campaign.ask]}.
${campaign.notes ? `Indicaciones del equipo: ${campaign.notes}` : ""}

Para cada candidato devolvé:
- fit_score de 0 a 100: qué tan parecido es al perfil ideal, solo con los datos que tenés (nombre, rubro, zona, reseñas). Si el rubro no tiene nada que ver, menos de 20.
- reasons: una frase corta en español con el porqué.
- message: mensaje de WhatsApp en español rioplatense con voseo, de hasta 60 palabras, firmado como ${params.sellerName} de ${params.orgName}. Sin inventar datos del comercio que no estén en la lista.`;

  const list = params.candidates
    .map(
      (c, index) =>
        `${index}. ${c.name} · rubro: ${c.category ?? "sin dato"} · ${[c.city, c.province].filter(Boolean).join(", ") || "sin zona"}${c.rating ? ` · ${c.rating}★ (${c.reviews ?? 0} reseñas)` : ""}${c.website ? ` · web: ${c.website}` : ""}`
    )
    .join("\n");

  const result = await createAiMessage({
    meter: params.meter,
    system,
    messages: [{ role: "user", content: `Candidatos:\n${list}` }],
    maxTokens: 16_000,
    schema: scoringSchema,
  });
  if (!result.ok) {
    return null;
  }
  try {
    const parsed = JSON.parse(result.text) as { results: AiScore[] };
    return new Map(parsed.results.map((r) => [r.index, r]));
  } catch {
    return null;
  }
}

async function gatherCandidates(
  campaign: CampaignView,
  icp: IcpView | null,
  csvText: string | undefined,
  log: string[]
): Promise<RawProspect[]> {
  if (campaign.source === "lista") {
    const rows = csvText ? parseProspectCsv(csvText) : [];
    log.push(`Leímos ${rows.length} comercios de la lista propia.`);
    return rows;
  }
  const keywords = icp?.keywords.length ? icp.keywords : ["almacén"];
  const zones = campaign.zones.length ? campaign.zones : [campaign.country];
  const queries = keywords
    .flatMap((keyword) => zones.map((zone) => ({ keyword, zone })))
    .slice(0, MAX_PLACES_QUERIES);
  const results: RawProspect[] = [];
  for (const query of queries) {
    const found = await searchPlaces({ ...query, country: campaign.country });
    log.push(
      `Google Places · "${query.keyword}" en ${query.zone}: ${found.length} comercios.`
    );
    results.push(...found);
  }
  return results;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: la corrida encadena buscar, filtrar, puntuar y guardar
export async function runCampaign(params: {
  admin: AdminClient;
  access: CommercialAiAccess;
  campaignId: string;
  csvText?: string;
  sellerName: string;
}): Promise<{ runId: string; created: number }> {
  const { admin, access } = params;
  const org = access.organizationId;
  const log: string[] = [];

  const { data: campaignRow, error } = await admin
    .from("commercial_ai_campaigns")
    .select("*")
    .eq("organization_id", org)
    .eq("id", params.campaignId)
    .maybeSingle();
  if (error || !campaignRow) {
    throw new Error("Campaña no encontrada");
  }
  const campaign = mapCampaign(campaignRow as Row);
  if (access.role === "vendedor" && campaign.sellerId !== access.userId) {
    throw new Error("Esta campaña no es tuya");
  }
  const { data: icpRow } = campaign.icpId
    ? await admin
        .from("commercial_ai_icps")
        .select("*")
        .eq("id", campaign.icpId)
        .maybeSingle()
    : { data: null };
  const icp = icpRow ? mapIcp(icpRow as Row) : null;

  const { data: runRow, error: runError } = await admin
    .from("commercial_ai_campaign_runs")
    .insert({
      organization_id: org,
      campaign_id: campaign.id,
      status: "corriendo",
      created_by: access.userId,
    })
    .select("id")
    .single();
  if (runError || !runRow) {
    throw new Error(runError?.message ?? "No se pudo iniciar la corrida");
  }
  const runId = runRow.id as string;

  try {
    const candidates = await gatherCandidates(
      campaign,
      icp,
      params.csvText,
      log
    );

    const [{ data: existing }, { data: customers }] = await Promise.all([
      admin
        .from("commercial_ai_prospects")
        .select("name, city, external_id")
        .eq("organization_id", org),
      admin
        .from("customers")
        .select("business_name, fantasy_name")
        .eq("organization_id", org),
    ]);
    const normalize = (text: string | null | undefined) =>
      (text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
    const { kept, discarded } = filterCandidates(candidates, {
      existingKeys: new Set(
        (existing ?? []).map((p) =>
          dedupeKey({ name: p.name as string, city: p.city as string | null })
        )
      ),
      existingExternalIds: new Set(
        (existing ?? [])
          .map((p) => p.external_id as string | null)
          .filter((id): id is string => !!id)
      ),
      customerNames: new Set(
        (customers ?? [])
          .flatMap((c) => [
            normalize(c.business_name as string),
            normalize(c.fantasy_name as string),
          ])
          .filter(Boolean)
      ),
      exclusions: campaign.exclusions,
    });
    log.push(
      `Descartamos ${discarded.length}: ${summarizeDiscards(discarded)}.`
    );

    const toScore = kept.slice(0, MAX_AI_CANDIDATES);
    let usedAi = false;
    let aiScores: Map<number, AiScore> | null = null;
    if (isAiEnabled() && toScore.length) {
      try {
        aiScores = await scoreWithAi({
          meter: {
            organizationId: access.organizationId,
            userId: access.userId,
            userName: access.userName,
            feature: "campana",
          },
          candidates: toScore,
          campaign,
          icp,
          orgName: access.organizationName,
          sellerName: params.sellerName,
        });
      } catch (failure) {
        if (!(failure instanceof AiBudgetExceededError)) {
          throw failure;
        }
        log.push(`IA no usada: ${failure.message}`);
      }
      usedAi = aiScores !== null;
      log.push(
        usedAi
          ? "La IA puntuó el encaje y escribió los mensajes."
          : "La IA no respondió: usamos reglas."
      );
    } else {
      log.push("Puntuamos el encaje con reglas (la IA no está activa).");
    }

    const scored: ScoredProspect[] = toScore.map((candidate, index) => {
      const ai = aiScores?.get(index);
      if (ai) {
        return {
          ...candidate,
          fitScore: Math.max(0, Math.min(100, ai.fit_score)),
          fitReasons: ai.reasons,
          message: ai.message,
        };
      }
      const rule = ruleFitScore(candidate, icp);
      return {
        ...candidate,
        fitScore: rule.score,
        fitReasons: rule.reasons,
        message: templateMessage({
          prospectName: candidate.name,
          orgName: access.organizationName,
          sellerName: params.sellerName,
          campaign,
          icp,
        }),
      };
    });

    const selected = scored
      .filter((p) => p.fitScore >= campaign.affinityMin)
      .sort((a, b) => b.fitScore - a.fitScore)
      .slice(0, campaign.maxPerRun);
    log.push(
      `${scored.length - selected.length} quedaron debajo de la afinidad mínima (${campaign.affinityMin}) o del tope por corrida (${campaign.maxPerRun}).`
    );

    if (selected.length) {
      const { data: inserted, error: insertError } = await admin
        .from("commercial_ai_prospects")
        .insert(
          selected.map((p) => ({
            organization_id: org,
            campaign_id: campaign.id,
            run_id: runId,
            seller_id: campaign.sellerId,
            name: p.name,
            category: p.category,
            address: p.address,
            city: p.city,
            province: p.province,
            phone: p.phone,
            email: p.email,
            website: p.website,
            source: p.source,
            external_id: p.externalId,
            fit_score: p.fitScore,
            fit_reasons: p.fitReasons,
            message: p.message,
          }))
        )
        .select("id");
      if (insertError) {
        throw new Error(insertError.message);
      }
      await admin.from("commercial_ai_prospect_events").insert(
        (inserted ?? []).map((row) => ({
          organization_id: org,
          prospect_id: row.id,
          kind: "system",
          body: `Detectado por la campaña ${campaign.name}`,
          actor_name: "IA Comercial",
        }))
      );
    }
    log.push(`Sumamos ${selected.length} prospectos nuevos.`);

    await admin
      .from("commercial_ai_campaign_runs")
      .update({
        status: "terminada",
        found: candidates.length,
        discarded: discarded.length,
        created_count: selected.length,
        used_ai: usedAi,
        log,
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);
    return { runId, created: selected.length };
  } catch (failure) {
    const message =
      failure instanceof Error ? failure.message : "Error desconocido";
    log.push(`Falló: ${message}`);
    await admin
      .from("commercial_ai_campaign_runs")
      .update({
        status: "fallida",
        error: message,
        log,
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);
    throw failure;
  }
}

function summarizeDiscards(discarded: { why: string }[]): string {
  if (!discarded.length) {
    return "ninguno";
  }
  const counts = new Map<string, number>();
  for (const item of discarded) {
    counts.set(item.why, (counts.get(item.why) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([why, count]) => `${count} ${why}`)
    .join(", ");
}

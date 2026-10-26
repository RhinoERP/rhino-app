"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin-client";
import {
  type CommercialAiAccess,
  requireCommercialAiAccess,
} from "../service/commercial-ai.service";
import { runCampaign } from "../service/prospecting.service";

export type ActionResult = { success: boolean; error?: string; id?: string };

const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

const pagePath = (orgSlug: string) => `/org/${orgSlug}/ia-comercial`;

function fail(error: unknown): ActionResult {
  return {
    success: false,
    error: error instanceof Error ? error.message : "No se pudo guardar",
  };
}

function check(error: { code?: string; message: string } | null) {
  if (!error) {
    return;
  }
  if (error.code && MISSING_TABLE_CODES.has(error.code)) {
    throw new Error("Falta aplicar la migración de rutas y prospección.");
  }
  throw new Error(error.message);
}

function done(orgSlug: string, id?: string): ActionResult {
  revalidatePath(pagePath(orgSlug));
  return { success: true, id };
}

/** Un vendedor solo opera sobre lo suyo; el gerente sobre todo. */
function assertOwner(access: CommercialAiAccess, sellerId: string | null) {
  if (access.role === "vendedor" && sellerId !== access.userId) {
    throw new Error("Esto no es de tu cartera");
  }
}

const uuid = z.uuid();
const text = (max: number) => z.string().trim().max(max);

/* ============ Configuración de rutas y memoria ============ */

async function mergeSettings(
  access: CommercialAiAccess,
  patch: Record<string, unknown>
) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("commercial_ai_settings")
    .select("config")
    .eq("organization_id", access.organizationId)
    .maybeSingle();
  const { error } = await admin.from("commercial_ai_settings").upsert(
    {
      organization_id: access.organizationId,
      config: { ...((data?.config as object) ?? {}), ...patch },
      updated_by: access.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" }
  );
  check(error);
}

const routeSettingsSchema = z.object({
  tope: z.number().int().min(1).max(25),
  orden: z
    .array(z.enum(["valor", "riesgo", "seguimiento", "dias"]))
    .length(4)
    .refine(
      (list) => new Set(list).size === 4,
      "Cada criterio va una sola vez"
    ),
});

export async function saveRouteSettingsAction(
  orgSlug: string,
  input: z.infer<typeof routeSettingsSchema>
): Promise<ActionResult> {
  try {
    const routes = routeSettingsSchema.parse(input);
    const access = await requireCommercialAiAccess(orgSlug, "manage");
    await mergeSettings(access, { routes });
    return done(orgSlug);
  } catch (error) {
    return fail(error);
  }
}

export async function setMemoryAction(
  orgSlug: string,
  memoryOn: boolean
): Promise<ActionResult> {
  try {
    const access = await requireCommercialAiAccess(orgSlug, "manage");
    await mergeSettings(access, { memoryOn: Boolean(memoryOn) });
    return done(orgSlug);
  } catch (error) {
    return fail(error);
  }
}

/* ============ Territorios y partidas ============ */

const territorySchema = z.object({
  id: uuid.optional(),
  name: text(120).min(1),
  places: z.array(text(160).min(1)).min(1).max(50),
  sellerIds: z.array(uuid).max(50),
});

export async function saveTerritoryAction(
  orgSlug: string,
  input: z.infer<typeof territorySchema>
): Promise<ActionResult> {
  try {
    const data = territorySchema.parse(input);
    const access = await requireCommercialAiAccess(orgSlug, "manage");
    const admin = createAdminClient();
    const row = {
      organization_id: access.organizationId,
      name: data.name,
      places: data.places,
      seller_ids: data.sellerIds,
      updated_at: new Date().toISOString(),
    };
    const { error } = data.id
      ? await admin
          .from("commercial_ai_territories")
          .update(row)
          .eq("organization_id", access.organizationId)
          .eq("id", data.id)
      : await admin.from("commercial_ai_territories").insert(row);
    check(error);
    return done(orgSlug);
  } catch (error) {
    return fail(error);
  }
}

export async function deleteTerritoryAction(
  orgSlug: string,
  id: string
): Promise<ActionResult> {
  try {
    const access = await requireCommercialAiAccess(orgSlug, "manage");
    const { error } = await createAdminClient()
      .from("commercial_ai_territories")
      .delete()
      .eq("organization_id", access.organizationId)
      .eq("id", uuid.parse(id));
    check(error);
    return done(orgSlug);
  } catch (error) {
    return fail(error);
  }
}

const startSchema = z.object({
  name: text(120).min(1),
  address: text(240).min(1),
  isDefault: z.boolean(),
});

export async function saveRouteStartAction(
  orgSlug: string,
  input: z.infer<typeof startSchema>
): Promise<ActionResult> {
  try {
    const data = startSchema.parse(input);
    const access = await requireCommercialAiAccess(orgSlug, "manage");
    const admin = createAdminClient();
    if (data.isDefault) {
      await admin
        .from("commercial_ai_route_starts")
        .update({ is_default: false })
        .eq("organization_id", access.organizationId);
    }
    const { error } = await admin.from("commercial_ai_route_starts").insert({
      organization_id: access.organizationId,
      name: data.name,
      address: data.address,
      is_default: data.isDefault,
    });
    check(error);
    return done(orgSlug);
  } catch (error) {
    return fail(error);
  }
}

export async function deleteRouteStartAction(
  orgSlug: string,
  id: string
): Promise<ActionResult> {
  try {
    const access = await requireCommercialAiAccess(orgSlug, "manage");
    const { error } = await createAdminClient()
      .from("commercial_ai_route_starts")
      .delete()
      .eq("organization_id", access.organizationId)
      .eq("id", uuid.parse(id));
    check(error);
    return done(orgSlug);
  } catch (error) {
    return fail(error);
  }
}

/* ============ Rutas ============ */

const routeSchema = z.object({
  sellerId: uuid,
  date: z.iso.date(),
  territoryId: uuid.nullable(),
  places: z.array(text(160)).max(50),
  startLabel: text(240).nullable(),
  stops: z
    .array(
      z.object({
        kind: z.enum(["cliente", "prospecto"]),
        id: uuid,
        reason: text(300),
      })
    )
    .min(1)
    .max(25),
});

export async function createRouteAction(
  orgSlug: string,
  input: z.infer<typeof routeSchema>
): Promise<ActionResult> {
  try {
    const data = routeSchema.parse(input);
    const access = await requireCommercialAiAccess(orgSlug);
    assertOwner(access, data.sellerId);
    const admin = createAdminClient();
    const { data: route, error } = await admin
      .from("commercial_ai_routes")
      .insert({
        organization_id: access.organizationId,
        seller_id: data.sellerId,
        route_date: data.date,
        territory_id: data.territoryId,
        places: data.places,
        start_label: data.startLabel,
        created_by: access.userId,
        created_by_name: access.userName,
      })
      .select("id")
      .single();
    check(error);
    const { error: stopsError } = await admin
      .from("commercial_ai_route_stops")
      .insert(
        data.stops.map((stop, index) => ({
          organization_id: access.organizationId,
          route_id: route?.id,
          position: index + 1,
          customer_id: stop.kind === "cliente" ? stop.id : null,
          prospect_id: stop.kind === "prospecto" ? stop.id : null,
          reason: stop.reason,
        }))
      );
    check(stopsError);
    return done(orgSlug, route?.id as string);
  } catch (error) {
    return fail(error);
  }
}

export async function deleteRouteAction(
  orgSlug: string,
  routeId: string
): Promise<ActionResult> {
  try {
    const access = await requireCommercialAiAccess(orgSlug);
    const admin = createAdminClient();
    const { data: route } = await admin
      .from("commercial_ai_routes")
      .select("seller_id")
      .eq("organization_id", access.organizationId)
      .eq("id", uuid.parse(routeId))
      .maybeSingle();
    if (!route) {
      throw new Error("Ruta no encontrada");
    }
    assertOwner(access, route.seller_id as string | null);
    const { error } = await admin
      .from("commercial_ai_routes")
      .delete()
      .eq("id", routeId);
    check(error);
    return done(orgSlug);
  } catch (error) {
    return fail(error);
  }
}

const RESULT_TEXT = {
  pedido: "Visita: hizo un pedido",
  interesado: "Visita: le interesó, quedamos en volver a hablar",
  noestaba: "Visita: no estaba el encargado",
  seguimiento: "Visita: pidió que lo volvamos a ver",
  nofue: "Visita: no se pudo pasar",
} as const;

const PROSPECT_STAGE_AFTER_VISIT = {
  pedido: "esperando_pedido",
  interesado: "en_conversacion",
  seguimiento: "contactado",
} as const;

const stopResultSchema = z.object({
  stopId: uuid,
  result: z
    .enum(["pedido", "interesado", "noestaba", "seguimiento", "nofue"])
    .nullable(),
  note: text(1000),
});

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: registra la visita y la refleja en la cuenta visitada
export async function recordStopResultAction(
  orgSlug: string,
  input: z.infer<typeof stopResultSchema>
): Promise<ActionResult> {
  try {
    const data = stopResultSchema.parse(input);
    const access = await requireCommercialAiAccess(orgSlug);
    const admin = createAdminClient();
    const { data: stop } = await admin
      .from("commercial_ai_route_stops")
      .select(
        "id, route_id, customer_id, prospect_id, commercial_ai_routes!inner(seller_id)"
      )
      .eq("organization_id", access.organizationId)
      .eq("id", data.stopId)
      .maybeSingle();
    if (!stop) {
      throw new Error("Parada no encontrada");
    }
    const route = stop.commercial_ai_routes as unknown as {
      seller_id: string | null;
    };
    assertOwner(access, route.seller_id);
    const { error } = await admin
      .from("commercial_ai_route_stops")
      .update({
        result: data.result,
        note: data.note,
        result_at: data.result ? new Date().toISOString() : null,
      })
      .eq("id", data.stopId);
    check(error);

    if (data.result) {
      const body = data.note
        ? `${RESULT_TEXT[data.result]} · ${data.note}`
        : RESULT_TEXT[data.result];
      if (stop.customer_id) {
        await admin.from("commercial_ai_events").insert({
          organization_id: access.organizationId,
          customer_id: stop.customer_id,
          kind: "note",
          body,
          actor_id: access.userId,
          actor_name: access.userName,
        });
      } else if (stop.prospect_id) {
        await admin.from("commercial_ai_prospect_events").insert({
          organization_id: access.organizationId,
          prospect_id: stop.prospect_id,
          kind: "visit",
          body,
          actor_id: access.userId,
          actor_name: access.userName,
        });
        const nextStage =
          data.result in PROSPECT_STAGE_AFTER_VISIT
            ? PROSPECT_STAGE_AFTER_VISIT[
                data.result as keyof typeof PROSPECT_STAGE_AFTER_VISIT
              ]
            : null;
        if (nextStage) {
          await admin
            .from("commercial_ai_prospects")
            .update({ stage: nextStage, updated_at: new Date().toISOString() })
            .eq("id", stop.prospect_id)
            .in("stage", ["sin_contactar", "contactado", "en_conversacion"]);
        }
      }
    }
    return done(orgSlug);
  } catch (error) {
    return fail(error);
  }
}

/* ============ Perfiles de cliente ideal ============ */

const icpSchema = z.object({
  id: uuid.optional(),
  name: text(120).min(1),
  description: text(1000),
  keywords: z.array(text(80).min(1)).min(1).max(20),
  personas: z.array(text(80).min(1)).max(10),
  valueProposition: text(1000),
});

export async function saveIcpAction(
  orgSlug: string,
  input: z.infer<typeof icpSchema>
): Promise<ActionResult> {
  try {
    const data = icpSchema.parse(input);
    const access = await requireCommercialAiAccess(orgSlug, "manage");
    const admin = createAdminClient();
    const row = {
      organization_id: access.organizationId,
      name: data.name,
      description: data.description,
      keywords: data.keywords,
      personas: data.personas,
      value_proposition: data.valueProposition,
      updated_at: new Date().toISOString(),
    };
    const { error } = data.id
      ? await admin
          .from("commercial_ai_icps")
          .update(row)
          .eq("organization_id", access.organizationId)
          .eq("id", data.id)
      : await admin.from("commercial_ai_icps").insert(row);
    check(error);
    return done(orgSlug);
  } catch (error) {
    return fail(error);
  }
}

export async function deleteIcpAction(
  orgSlug: string,
  id: string
): Promise<ActionResult> {
  try {
    const access = await requireCommercialAiAccess(orgSlug, "manage");
    const { error } = await createAdminClient()
      .from("commercial_ai_icps")
      .delete()
      .eq("organization_id", access.organizationId)
      .eq("id", uuid.parse(id));
    check(error);
    return done(orgSlug);
  } catch (error) {
    return fail(error);
  }
}

/* ============ Campañas ============ */

const campaignSchema = z.object({
  id: uuid.optional(),
  name: text(160).min(1),
  sellerId: uuid.nullable(),
  status: z.enum(["borrador", "activa", "pausada", "archivada"]),
  goalCount: z.number().int().positive().nullable(),
  goalKind: z.enum(["contactadas", "reuniones", "respuestas"]).nullable(),
  startDate: z.iso.date(),
  endDate: z.iso.date().nullable(),
  affinityMin: z.number().int().min(1).max(100),
  maxPerRun: z.number().int().min(1).max(200),
  icpId: uuid.nullable(),
  persona: text(120).nullable(),
  source: z.enum(["lista", "google_places"]),
  country: text(60).min(1),
  zones: z.array(text(160).min(1)).max(30),
  exclusions: z.array(text(160).min(1)).max(500),
  entryStrategy: z.enum(["catalogo", "ia"]),
  catalogUrl: z.url().nullable(),
  ask: z.enum(["responder", "diagnostico", "reunion", "visita"]),
  channels: z.array(z.enum(["whatsapp", "email"])).min(1),
  notes: text(2000),
});

export async function saveCampaignAction(
  orgSlug: string,
  input: z.infer<typeof campaignSchema>
): Promise<ActionResult> {
  try {
    const data = campaignSchema.parse(input);
    const access = await requireCommercialAiAccess(orgSlug, "manage");
    const admin = createAdminClient();
    const row = {
      organization_id: access.organizationId,
      name: data.name,
      seller_id: data.sellerId,
      status: data.status,
      goal_count: data.goalCount,
      goal_kind: data.goalKind,
      start_date: data.startDate,
      end_date: data.endDate,
      affinity_min: data.affinityMin,
      max_per_run: data.maxPerRun,
      icp_id: data.icpId,
      persona: data.persona,
      source: data.source,
      country: data.country,
      zones: data.zones,
      exclusions: data.exclusions,
      entry_strategy: data.entryStrategy,
      catalog_url: data.catalogUrl,
      ask: data.ask,
      channels: data.channels,
      notes: data.notes,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { error: updateError } = await admin
        .from("commercial_ai_campaigns")
        .update(row)
        .eq("organization_id", access.organizationId)
        .eq("id", data.id);
      check(updateError);
      return done(orgSlug, data.id);
    }
    const { data: created, error } = await admin
      .from("commercial_ai_campaigns")
      .insert({ ...row, created_by: access.userId })
      .select("id")
      .single();
    check(error);
    return done(orgSlug, created?.id as string);
  } catch (error) {
    return fail(error);
  }
}

export async function setCampaignStatusAction(
  orgSlug: string,
  id: string,
  status: "activa" | "pausada" | "archivada"
): Promise<ActionResult> {
  try {
    const access = await requireCommercialAiAccess(orgSlug, "manage");
    const { error } = await createAdminClient()
      .from("commercial_ai_campaigns")
      .update({
        status: z.enum(["activa", "pausada", "archivada"]).parse(status),
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", access.organizationId)
      .eq("id", uuid.parse(id));
    check(error);
    return done(orgSlug);
  } catch (error) {
    return fail(error);
  }
}

const MAX_CSV_LENGTH = 2_000_000;

export async function runCampaignAction(
  orgSlug: string,
  campaignId: string,
  csvText?: string
): Promise<ActionResult & { created?: number }> {
  try {
    const access = await requireCommercialAiAccess(orgSlug);
    if (csvText && csvText.length > MAX_CSV_LENGTH) {
      throw new Error("La lista es demasiado grande (máximo 2 MB).");
    }
    const admin = createAdminClient();
    const { data: campaign } = await admin
      .from("commercial_ai_campaigns")
      .select("seller_id")
      .eq("organization_id", access.organizationId)
      .eq("id", uuid.parse(campaignId))
      .maybeSingle();
    let sellerName = access.userName;
    if (campaign?.seller_id) {
      const { data: seller } = await admin.auth.admin.getUserById(
        campaign.seller_id as string
      );
      sellerName =
        (seller.user?.user_metadata?.full_name as string | undefined) ??
        seller.user?.email ??
        sellerName;
    }
    const result = await runCampaign({
      admin,
      access,
      campaignId,
      csvText,
      sellerName: sellerName.split(" ")[0] ?? sellerName,
    });
    revalidatePath(pagePath(orgSlug));
    return { success: true, id: result.runId, created: result.created };
  } catch (error) {
    return fail(error);
  }
}

/* ============ Prospectos ============ */

async function loadProspect(access: CommercialAiAccess, id: string) {
  const { data } = await createAdminClient()
    .from("commercial_ai_prospects")
    .select("id, seller_id, stage")
    .eq("organization_id", access.organizationId)
    .eq("id", uuid.parse(id))
    .maybeSingle();
  if (!data) {
    throw new Error("Prospecto no encontrado");
  }
  assertOwner(access, data.seller_id as string | null);
  return data;
}

async function prospectEvent(
  access: CommercialAiAccess,
  prospectId: string,
  kind: "note" | "stage" | "visit" | "system",
  body: string
) {
  const { error } = await createAdminClient()
    .from("commercial_ai_prospect_events")
    .insert({
      organization_id: access.organizationId,
      prospect_id: prospectId,
      kind,
      body,
      actor_id: access.userId,
      actor_name: access.userName,
    });
  check(error);
}

const PROSPECT_STAGE_TEXT = {
  sin_contactar: "Volvió a sin contactar",
  contactado: "Contactado",
  en_conversacion: "En conversación",
  esperando_pedido: "Esperando primer pedido",
  perdido: "Perdido",
  descartado: "Descartado",
} as const;

export async function updateProspectStageAction(
  orgSlug: string,
  input: {
    prospectId: string;
    stage: keyof typeof PROSPECT_STAGE_TEXT;
    note?: string;
  }
): Promise<ActionResult> {
  try {
    const stage = z
      .enum(
        Object.keys(PROSPECT_STAGE_TEXT) as [keyof typeof PROSPECT_STAGE_TEXT]
      )
      .parse(input.stage);
    const access = await requireCommercialAiAccess(orgSlug);
    await loadProspect(access, input.prospectId);
    const { error } = await createAdminClient()
      .from("commercial_ai_prospects")
      .update({ stage, updated_at: new Date().toISOString() })
      .eq("id", input.prospectId);
    check(error);
    const note = input.note?.trim();
    await prospectEvent(
      access,
      input.prospectId,
      "stage",
      note
        ? `${PROSPECT_STAGE_TEXT[stage]} · ${note}`
        : PROSPECT_STAGE_TEXT[stage]
    );
    return done(orgSlug);
  } catch (error) {
    return fail(error);
  }
}

const prospectUpdateSchema = z.object({
  prospectId: uuid,
  phone: text(60).nullable(),
  email: z
    .email()
    .nullable()
    .or(z.literal("").transform(() => null)),
  message: text(2000),
  nextStep: text(300).nullable(),
  nextStepDate: z.iso.date().nullable(),
});

export async function updateProspectAction(
  orgSlug: string,
  input: z.infer<typeof prospectUpdateSchema>
): Promise<ActionResult> {
  try {
    const data = prospectUpdateSchema.parse(input);
    const access = await requireCommercialAiAccess(orgSlug);
    await loadProspect(access, data.prospectId);
    const { error } = await createAdminClient()
      .from("commercial_ai_prospects")
      .update({
        phone: data.phone || null,
        email: data.email,
        message: data.message,
        next_step: data.nextStep || null,
        next_step_date: data.nextStepDate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.prospectId);
    check(error);
    if (data.nextStep) {
      await prospectEvent(
        access,
        data.prospectId,
        "note",
        `Próximo paso${data.nextStepDate ? ` (${data.nextStepDate})` : ""}: ${data.nextStep}`
      );
    }
    return done(orgSlug);
  } catch (error) {
    return fail(error);
  }
}

export async function addProspectNoteAction(
  orgSlug: string,
  prospectId: string,
  body: string
): Promise<ActionResult> {
  try {
    const note = text(2000).min(1).parse(body);
    const access = await requireCommercialAiAccess(orgSlug);
    await loadProspect(access, prospectId);
    await prospectEvent(access, prospectId, "note", note);
    return done(orgSlug);
  } catch (error) {
    return fail(error);
  }
}

const manualProspectSchema = z.object({
  name: text(160).min(1),
  category: text(120).nullable(),
  address: text(240).nullable(),
  city: text(120).nullable(),
  phone: text(60).nullable(),
  sellerId: uuid.nullable(),
});

export async function createProspectAction(
  orgSlug: string,
  input: z.infer<typeof manualProspectSchema>
): Promise<ActionResult> {
  try {
    const data = manualProspectSchema.parse(input);
    const access = await requireCommercialAiAccess(orgSlug);
    const sellerId = access.role === "vendedor" ? access.userId : data.sellerId;
    const admin = createAdminClient();
    const { data: created, error } = await admin
      .from("commercial_ai_prospects")
      .insert({
        organization_id: access.organizationId,
        seller_id: sellerId,
        name: data.name,
        category: data.category || null,
        address: data.address || null,
        city: data.city || null,
        phone: data.phone || null,
        source: "manual",
      })
      .select("id")
      .single();
    check(error);
    await prospectEvent(
      access,
      created?.id as string,
      "system",
      "Cargado a mano"
    );
    return done(orgSlug, created?.id as string);
  } catch (error) {
    return fail(error);
  }
}

/* ============ Aprendizajes ============ */

export async function addLearningNoteAction(
  orgSlug: string,
  input: { title: string; body: string }
): Promise<ActionResult> {
  try {
    const title = text(160).min(1).parse(input.title);
    const body = text(4000).parse(input.body);
    const access = await requireCommercialAiAccess(orgSlug);
    const { error } = await createAdminClient()
      .from("commercial_ai_learnings")
      .insert({
        organization_id: access.organizationId,
        kind: "nota",
        title,
        body,
        created_by: access.userId,
        actor_name: access.userName,
      });
    check(error);
    return done(orgSlug);
  } catch (error) {
    return fail(error);
  }
}

export async function saveLearnedPatternAction(
  orgSlug: string,
  input: { title: string; body: string }
): Promise<ActionResult> {
  try {
    const access = await requireCommercialAiAccess(orgSlug, "manage");
    const { error } = await createAdminClient()
      .from("commercial_ai_learnings")
      .insert({
        organization_id: access.organizationId,
        kind: "patron",
        title: text(200).min(1).parse(input.title),
        body: text(4000).parse(input.body),
        created_by: access.userId,
        actor_name: access.userName,
      });
    check(error);
    return done(orgSlug);
  } catch (error) {
    return fail(error);
  }
}

export async function archiveLearningAction(
  orgSlug: string,
  id: string
): Promise<ActionResult> {
  try {
    const access = await requireCommercialAiAccess(orgSlug, "manage");
    const { error } = await createAdminClient()
      .from("commercial_ai_learnings")
      .update({ status: "descartada" })
      .eq("organization_id", access.organizationId)
      .eq("id", uuid.parse(id));
    check(error);
    return done(orgSlug);
  } catch (error) {
    return fail(error);
  }
}

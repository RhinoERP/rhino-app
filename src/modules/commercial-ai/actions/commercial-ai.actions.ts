"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { STAGE_EVENT_TEXT } from "../constants";
import {
  type CommercialAiAccess,
  requireCommercialAiAccess,
} from "../service/commercial-ai.service";
import { DEFAULT_COMMERCIAL_AI_CONFIG } from "../types";

export type CommercialAiActionResult = { success: boolean; error?: string };

const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

function pagePath(orgSlug: string) {
  return `/org/${orgSlug}/ia-comercial`;
}

function toResult(error: unknown): CommercialAiActionResult {
  return {
    success: false,
    error: error instanceof Error ? error.message : "No se pudo guardar",
  };
}

function assertWrite(error: { code?: string; message: string } | null) {
  if (!error) {
    return;
  }
  if (error.code && MISSING_TABLE_CODES.has(error.code)) {
    throw new Error(
      "Falta aplicar la migración de IA Comercial en la base de datos."
    );
  }
  throw new Error(error.message);
}

/** Un vendedor solo puede tocar clientes de su cartera. */
async function assertCustomerInScope(
  access: CommercialAiAccess,
  customerId: string
): Promise<{ sellerId: string | null }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("customers")
    .select("id, assigned_seller_id")
    .eq("organization_id", access.organizationId)
    .eq("id", customerId)
    .maybeSingle();
  if (error || !data) {
    throw new Error("Cliente no encontrado");
  }
  const sellerId = (data.assigned_seller_id as string | null) ?? null;
  if (access.role === "vendedor" && sellerId && sellerId !== access.userId) {
    throw new Error("Este cliente no es de tu cartera");
  }
  return { sellerId };
}

async function insertEvent(
  access: CommercialAiAccess,
  event: {
    customerId: string;
    opportunityKey?: string | null;
    kind: "note" | "stage" | "preventa" | "task";
    body: string;
  }
) {
  const admin = createAdminClient();
  const { error } = await admin.from("commercial_ai_events").insert({
    organization_id: access.organizationId,
    customer_id: event.customerId,
    opportunity_key: event.opportunityKey ?? null,
    kind: event.kind,
    body: event.body,
    actor_id: access.userId,
    actor_name: access.userName,
  });
  assertWrite(error);
}

/* ============ Etapas de oportunidades ============ */

const stageSchema = z.object({
  opportunityKey: z.string().min(1),
  customerId: z.uuid(),
  stage: z.enum([
    "nueva",
    "contactada",
    "respondio",
    "ganada",
    "perdida",
    "ignorada",
    "despues",
  ]),
  note: z.string().max(1000).optional(),
  snoozeUntil: z.iso.date().optional(),
});

export async function updateOpportunityStageAction(
  orgSlug: string,
  input: z.infer<typeof stageSchema>
): Promise<CommercialAiActionResult> {
  try {
    const data = stageSchema.parse(input);
    const access = await requireCommercialAiAccess(orgSlug);
    const { sellerId } = await assertCustomerInScope(access, data.customerId);
    const now = new Date().toISOString();
    const admin = createAdminClient();

    const { data: current } = await admin
      .from("commercial_ai_opportunity_states")
      .select("contacted_at")
      .eq("organization_id", access.organizationId)
      .eq("opportunity_key", data.opportunityKey)
      .maybeSingle();

    const contactedAt =
      data.stage === "contactada"
        ? now
        : ((current?.contacted_at as string | null | undefined) ?? null);

    const { error } = await admin
      .from("commercial_ai_opportunity_states")
      .upsert(
        {
          organization_id: access.organizationId,
          opportunity_key: data.opportunityKey,
          customer_id: data.customerId,
          seller_id: sellerId,
          stage: data.stage,
          snooze_until:
            data.stage === "despues" ? (data.snoozeUntil ?? null) : null,
          contacted_at: contactedAt,
          last_touched_at: now,
          updated_by: access.userId,
          updated_at: now,
        },
        { onConflict: "organization_id,opportunity_key" }
      );
    assertWrite(error);

    const label =
      data.stage === "despues"
        ? `Para después${data.snoozeUntil ? `: ${data.snoozeUntil}` : ""}`
        : (STAGE_EVENT_TEXT[data.stage] ?? data.stage);
    await insertEvent(access, {
      customerId: data.customerId,
      opportunityKey: data.opportunityKey,
      kind: "stage",
      body: data.note ? `${label} · ${data.note}` : label,
    });

    revalidatePath(pagePath(orgSlug));
    return { success: true };
  } catch (error) {
    return toResult(error);
  }
}

/* ============ Notas y preventa ============ */

const noteSchema = z.object({
  customerId: z.uuid(),
  opportunityKey: z.string().optional(),
  body: z.string().trim().min(1).max(2000),
});

export async function addCustomerNoteAction(
  orgSlug: string,
  input: z.infer<typeof noteSchema>
): Promise<CommercialAiActionResult> {
  try {
    const data = noteSchema.parse(input);
    const access = await requireCommercialAiAccess(orgSlug);
    await assertCustomerInScope(access, data.customerId);
    await insertEvent(access, {
      customerId: data.customerId,
      opportunityKey: data.opportunityKey,
      kind: "note",
      body: data.body,
    });
    revalidatePath(pagePath(orgSlug));
    return { success: true };
  } catch (error) {
    return toResult(error);
  }
}

/**
 * Registra que el vendedor fue a cargar la preventa en Rhinos y, si la
 * oportunidad estaba sin tocar, la pasa a "contactada".
 */
export async function markPreventaStartedAction(
  orgSlug: string,
  input: { customerId: string; opportunityKey?: string | null }
): Promise<CommercialAiActionResult> {
  try {
    const customerId = z.uuid().parse(input.customerId);
    const access = await requireCommercialAiAccess(orgSlug);
    const { sellerId } = await assertCustomerInScope(access, customerId);
    await insertEvent(access, {
      customerId,
      opportunityKey: input.opportunityKey,
      kind: "preventa",
      body: "Fue a cargar la preventa en Rhinos",
    });

    if (input.opportunityKey) {
      const admin = createAdminClient();
      const { data: current } = await admin
        .from("commercial_ai_opportunity_states")
        .select("stage")
        .eq("organization_id", access.organizationId)
        .eq("opportunity_key", input.opportunityKey)
        .maybeSingle();
      const stage = (current?.stage as string | undefined) ?? "nueva";
      if (stage === "nueva" || stage === "despues") {
        const now = new Date().toISOString();
        const { error } = await admin
          .from("commercial_ai_opportunity_states")
          .upsert(
            {
              organization_id: access.organizationId,
              opportunity_key: input.opportunityKey,
              customer_id: customerId,
              seller_id: sellerId,
              stage: "contactada",
              snooze_until: null,
              contacted_at: now,
              last_touched_at: now,
              updated_by: access.userId,
              updated_at: now,
            },
            { onConflict: "organization_id,opportunity_key" }
          );
        assertWrite(error);
      }
    }
    revalidatePath(pagePath(orgSlug));
    return { success: true };
  } catch (error) {
    return toResult(error);
  }
}

/* ============ Próximos pasos ============ */

const taskSchema = z.object({
  customerId: z.uuid(),
  body: z.string().trim().min(1).max(500),
  dueDate: z.iso.date(),
});

export async function createTaskAction(
  orgSlug: string,
  input: z.infer<typeof taskSchema>
): Promise<CommercialAiActionResult> {
  try {
    const data = taskSchema.parse(input);
    const access = await requireCommercialAiAccess(orgSlug);
    const { sellerId } = await assertCustomerInScope(access, data.customerId);
    const admin = createAdminClient();
    const { error } = await admin.from("commercial_ai_tasks").insert({
      organization_id: access.organizationId,
      customer_id: data.customerId,
      seller_id: sellerId ?? access.userId,
      body: data.body,
      due_date: data.dueDate,
      created_by: access.userId,
    });
    assertWrite(error);
    await insertEvent(access, {
      customerId: data.customerId,
      kind: "task",
      body: `Próximo paso (${data.dueDate}): ${data.body}`,
    });
    revalidatePath(pagePath(orgSlug));
    return { success: true };
  } catch (error) {
    return toResult(error);
  }
}

export async function completeTaskAction(
  orgSlug: string,
  taskId: string,
  done: boolean
): Promise<CommercialAiActionResult> {
  try {
    const id = z.uuid().parse(taskId);
    const access = await requireCommercialAiAccess(orgSlug);
    const admin = createAdminClient();
    const { data: task } = await admin
      .from("commercial_ai_tasks")
      .select("customer_id")
      .eq("organization_id", access.organizationId)
      .eq("id", id)
      .maybeSingle();
    if (!task) {
      throw new Error("Tarea no encontrada");
    }
    await assertCustomerInScope(access, task.customer_id as string);
    const { error } = await admin
      .from("commercial_ai_tasks")
      .update({ done_at: done ? new Date().toISOString() : null })
      .eq("organization_id", access.organizationId)
      .eq("id", id);
    assertWrite(error);
    revalidatePath(pagePath(orgSlug));
    return { success: true };
  } catch (error) {
    return toResult(error);
  }
}

/* ============ Objetivos (gerente) ============ */

const leversSchema = z.object({
  base: z.number().min(0),
  rec: z.number().min(0),
  vm: z.number().min(0),
  nue: z.number().min(0),
});

const goalsSchema = z.object({
  periodMonth: z.iso.date().refine((value) => value.endsWith("-01"), {
    message: "El período tiene que ser el primer día del mes",
  }),
  goals: z
    .array(
      z.object({
        sellerId: z.uuid().nullable(),
        levers: leversSchema,
      })
    )
    .min(1),
});

export async function saveGoalsAction(
  orgSlug: string,
  input: z.infer<typeof goalsSchema>
): Promise<CommercialAiActionResult> {
  try {
    const data = goalsSchema.parse(input);
    const access = await requireCommercialAiAccess(orgSlug, "manage");
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const rows = data.goals.map((goal) => ({
      organization_id: access.organizationId,
      period_month: data.periodMonth,
      seller_id: goal.sellerId,
      target_amount:
        goal.levers.base + goal.levers.rec + goal.levers.vm + goal.levers.nue,
      levers: goal.levers,
      created_by: access.userId,
      updated_at: now,
    }));
    const { error } = await admin
      .from("commercial_ai_goals")
      .upsert(rows, { onConflict: "organization_id,period_month,seller_id" });
    assertWrite(error);
    revalidatePath(pagePath(orgSlug));
    return { success: true };
  } catch (error) {
    return toResult(error);
  }
}

/* ============ Configuración del análisis (gerente) ============ */

const configSchema = z.object({
  dormDias: z.number().int().min(15).max(365),
  dormMin: z.number().int().min(1).max(50),
  dormOn: z.boolean(),
  riesgoOn: z.boolean(),
  riesgoCaida: z.number().int().min(5).max(95),
  riesgoRec: z.number().int().min(15).max(180),
  riesgoBase: z.number().int().min(30).max(365),
  riesgoMin: z.number().int().min(1).max(50),
  faltOn: z.boolean(),
  faltPct: z.number().int().min(10).max(100),
  crossOn: z.boolean(),
  crossPct: z.number().int().min(10).max(100),
  crossAnt: z.number().int().min(0).max(730),
  ventana: z.number().int().min(30).max(365),
  historia: z.number().int().min(30).max(730),
  minPares: z.number().int().min(1).max(100),
  maxOpps: z.number().int().min(1).max(10),
});

export async function saveConfigAction(
  orgSlug: string,
  input: unknown
): Promise<CommercialAiActionResult> {
  try {
    const config = configSchema.parse({
      ...DEFAULT_COMMERCIAL_AI_CONFIG,
      ...(input as object),
    });
    const access = await requireCommercialAiAccess(orgSlug, "manage");
    const admin = createAdminClient();
    const { error } = await admin.from("commercial_ai_settings").upsert(
      {
        organization_id: access.organizationId,
        config,
        updated_by: access.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id" }
    );
    assertWrite(error);
    revalidatePath(pagePath(orgSlug));
    return { success: true };
  } catch (error) {
    return toResult(error);
  }
}

import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getWhatsAppSandboxAccess } from "@/modules/whatsapp/server/access";
import { executeCommercialTool } from "@/modules/whatsapp/server/commercial-tools";
import { inboxJson, inboxResponse } from "@/modules/whatsapp/server/inbox";
import { assertWhatsAppOrderSchema } from "@/modules/whatsapp/server/order-schema";
import {
  createLocalSimulatorSession,
  getSimulationMessages,
  getSimulationSnapshot,
  getWhatsAppSimulationOptions,
  recordSimulationMessage,
  type SimulationState,
  verifyLocalSimulatorSession,
} from "@/modules/whatsapp/server/simulation";
import { createWhatsAppAdminClient } from "@/modules/whatsapp/server/supabase-admin";
import {
  type ConversationMessage,
  type ModelFunctionCall,
  type ModelResponse,
  runCommercialModel,
  type ToolCallAudit,
} from "../../../../../../../services/whatsapp-agent/src/agent-core";
import {
  claimJob,
  executeJob,
  workerDatabaseReady,
} from "../../../../../../../services/whatsapp-agent/src/jobs";

export const runtime = "nodejs";
export const maxDuration = 60;

const stateSchema = z
  .object({
    organizationId: z.string().uuid(),
    integrationId: z.string().uuid(),
    conversationId: z.string().uuid(),
    customerId: z.string().uuid(),
  })
  .strict();

const requestSchema = z
  .object({
    message: z.string().trim().min(1).max(2000).optional(),
    sourceMessageId: z.string().uuid().optional(),
    resume: z.boolean().optional(),
    expectedControlVersion: z.number().int().nonnegative().optional(),
    customerId: z.string().uuid().optional(),
    priceListId: z.string().uuid().optional(),
    state: stateSchema.optional(),
  })
  .strict()
  .refine(
    (input) =>
      input.resume
        ? Boolean(input.state) &&
          input.expectedControlVersion !== undefined &&
          !input.message &&
          !input.sourceMessageId
        : Boolean(input.message) !== Boolean(input.sourceMessageId) &&
          (!input.sourceMessageId || Boolean(input.state)),
    {
      message:
        "Para reactivar elegí una sesión y su versión de control; para conversar escribí un mensaje",
    }
  );

function selectedModel(): string {
  return process.env.WHATSAPP_AGENT_OPENAI_MODEL?.trim() || "gpt-5-mini";
}

async function requestModel(
  body: Record<string, unknown>
): Promise<ModelResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "La simulación requiere OPENAI_API_KEY en la configuración del servidor"
    );
  }
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error("El modelo no pudo procesar la consulta");
  }
  return (await response.json()) as ModelResponse;
}

async function resumeSimulation(
  state: SimulationState,
  actorId: string,
  expectedControlVersion: number | undefined
) {
  const { data, error } = await createWhatsAppAdminClient().rpc(
    "control_whatsapp_conversation",
    {
      p_organization_id: state.organizationId,
      p_conversation_id: state.conversationId,
      p_actor_id: actorId,
      p_operation: "RESUME",
      p_expected_control_version: expectedControlVersion,
    }
  );
  if (error || data?.success !== true) {
    throw new Error(
      "No se pudo reactivar: actualizá el estado y verificá que no haya envíos sin resolver."
    );
  }
  return {
    state,
    snapshot: await getSimulationSnapshot(state),
    toolCalls: [],
    simulated: true,
  };
}

type SimulationTurnParams = {
  actorId: string;
  canManageSales: boolean;
  organization: { id: string; name: string };
  input: z.infer<typeof requestSchema>;
};

async function runSimulationModel(
  params: SimulationTurnParams,
  state: SimulationState,
  sourceMessageId: string,
  leaseContext: { jobId?: string; leaseToken?: string } = {}
) {
  const messages: ConversationMessage[] = await getSimulationMessages(state);
  const audit: ToolCallAudit[] = [];
  const context = {
    ...leaseContext,
    organizationId: params.organization.id,
    integrationId: state.integrationId,
    conversationId: state.conversationId,
    sourceMessageId,
    mode: "LOCAL_SIMULATOR" as const,
  };
  const before = await getSimulationSnapshot(state);
  if (before.conversationStatus !== "ACTIVE") {
    return {
      response:
        "Una persona del equipo comercial va a continuar la atención por este chat.",
      state,
      snapshot: before,
      toolCalls: audit,
    };
  }
  const response = await runCommercialModel({
    model: selectedModel(),
    businessName: params.organization.name,
    context,
    messages,
    audit,
    requestModel,
    callTool: async (_context, call: ModelFunctionCall) => {
      try {
        if (call.name === "create_pre_sale" && !params.canManageSales) {
          return { error: "Necesitás el permiso sales.manage" };
        }
        return await executeCommercialTool(
          context,
          call.name as Parameters<typeof executeCommercialTool>[1],
          JSON.parse(call.arguments)
        );
      } catch (error) {
        return {
          error:
            error instanceof Error
              ? error.message
              : "No se pudo ejecutar la herramienta comercial",
        };
      }
    },
  });
  const rendered = (await executeCommercialTool(
    context,
    "render_order_response",
    { text: response.output_text?.trim() || "" }
  )) as { text: string; orderPrompt: boolean };
  const text = rendered.text?.trim();
  if (!text) {
    throw new Error("El asistente no produjo una respuesta para la simulación");
  }

  await recordSimulationMessage({
    ...leaseContext,
    state,
    direction: "OUTBOUND",
    content: text,
    sourceMessageId,
    orderPrompt: rendered.orderPrompt,
  });
  return {
    response: text,
    state,
    snapshot: await getSimulationSnapshot(state),
    toolCalls: audit.map(({ name }) => ({ name })),
    simulated: true,
  };
}

async function resolveSimulationState(
  params: SimulationTurnParams,
  actorId: string
): Promise<SimulationState> {
  let state: SimulationState;
  if (params.input.state) {
    state = params.input.state;
    if (state.organizationId !== params.organization.id) {
      throw new Error("La sesión de simulación pertenece a otra organización");
    }
    await verifyLocalSimulatorSession(state, actorId);
  } else {
    if (!(params.input.customerId && params.input.priceListId)) {
      throw new Error("Elegí un cliente y una lista de precios para empezar");
    }
    state = await createLocalSimulatorSession({
      organizationId: params.organization.id,
      actorId,
      customerId: params.input.customerId,
      priceListId: params.input.priceListId,
    });
  }

  return state;
}

async function runSimulationTurn(params: SimulationTurnParams) {
  const { actorId } = params;
  await assertWhatsAppOrderSchema();
  const db = createWhatsAppAdminClient();
  if (!(await workerDatabaseReady(db))) {
    throw new Error(
      "Falta completar la actualización de la base de datos de WhatsApp antes de iniciar la simulación."
    );
  }
  const state = await resolveSimulationState(params, actorId);

  if (params.input.resume) {
    return resumeSimulation(
      state,
      actorId,
      params.input.expectedControlVersion
    );
  }
  const sourceMessageId =
    params.input.sourceMessageId ||
    (await recordSimulationMessage({
      state,
      direction: "INBOUND",
      content: params.input.message || "",
    }));
  if (params.input.sourceMessageId) {
    const audio = await db
      .from("whatsapp_audio_assets")
      .select("status")
      .eq("message_id", sourceMessageId)
      .eq("organization_id", state.organizationId)
      .eq("integration_id", state.integrationId)
      .eq("conversation_id", state.conversationId)
      .single();
    if (audio.error || audio.data?.status !== "SUCCEEDED") {
      throw new Error(
        "El audio de esta sesión todavía no tiene una transcripción válida."
      );
    }
    const previous = await db
      .from("whatsapp_messages")
      .select("content")
      .eq("conversation_id", state.conversationId)
      .eq("organization_id", state.organizationId)
      .eq("direction", "OUTBOUND")
      .contains("payload", { sourceMessageId })
      .limit(1)
      .maybeSingle();
    if (previous.error) {
      throw new Error("No se pudo recuperar la respuesta del audio.");
    }
    if (previous.data?.content) {
      return {
        response: previous.data.content,
        state,
        snapshot: await getSimulationSnapshot(state),
        toolCalls: [],
        simulated: true,
      };
    }
  }
  const runTurn = (
    leaseContext: { jobId?: string; leaseToken?: string } = {}
  ) => runSimulationModel(params, state, sourceMessageId, leaseContext);
  const pending = await db
    .from("agent_jobs")
    .select("id")
    .eq("source_message_id", sourceMessageId)
    .eq("job_type", "PROCESS_CONVERSATION")
    .eq("execution_mode", "INLINE")
    .single();
  if (pending.error || !pending.data) {
    throw new Error("Falta preparar el trabajo comercial de la conversación.");
  }
  const job = await claimJob(db, "PROCESS_CONVERSATION", {
    workerId: `sandbox-commercial-${randomUUID()}`,
    mode: "INLINE",
    jobId: pending.data.id,
  });
  if (!job) {
    throw new Error(
      "La conversación está procesándose. Reintentá en unos segundos."
    );
  }
  let result: Awaited<ReturnType<typeof runTurn>> | undefined;
  await executeJob(db, job, async (): Promise<undefined> => {
    result = await runTurn({ jobId: job.id, leaseToken: job.lease_token });
  });
  return result;
}

export function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> }
) {
  return inboxResponse(async () => {
    const { orgSlug } = await params;
    const { organization } = await getWhatsAppSandboxAccess(
      orgSlug,
      request,
      "whatsapp.read"
    );
    return inboxJson(await getWhatsAppSimulationOptions(organization.id));
  });
}

export function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> }
) {
  return inboxResponse(async () => {
    const { orgSlug } = await params;
    const { organization, userId, hasPermission } =
      await getWhatsAppSandboxAccess(orgSlug, request, [
        "whatsapp.read",
        "whatsapp.manage",
      ]);
    const input = requestSchema.parse(await request.json().catch(() => null));
    const result = await runSimulationTurn({
      actorId: userId,
      canManageSales: hasPermission("sales.manage"),
      organization: { id: organization.id, name: organization.name },
      input,
    });
    return inboxJson(result);
  });
}

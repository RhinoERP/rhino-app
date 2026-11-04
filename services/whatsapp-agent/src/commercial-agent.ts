import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type AgentContext,
  type ConversationMessage,
  type ModelFunctionCall,
  type ModelResponse,
  runCommercialModel,
  type ToolCallAudit,
} from "./agent-core.js";
import { AudioError } from "./audio/config.js";
import { sendWhatsAppText } from "./meta-cloud.js";
import {
  type BusinessHours,
  getNextBusinessOpening,
  getNextResponseAt,
} from "./response-schedule.js";
import type { AgentJob, AgentJobProcessor } from "./worker.js";

const trailingSlash = /\/$/;

function apiBaseUrl(): string {
  const value = process.env.WHATSAPP_AGENT_RHINOS_URL?.trim();
  if (!value) {
    throw new Error("Falta WHATSAPP_AGENT_RHINOS_URL");
  }
  return value.replace(trailingSlash, "");
}

function serviceToken(): string {
  const value = process.env.WHATSAPP_AGENT_SERVICE_TOKEN;
  if (!value) {
    throw new Error("Falta WHATSAPP_AGENT_SERVICE_TOKEN");
  }
  return value;
}

function apiKey(): string {
  const value = process.env.OPENAI_API_KEY;
  if (!value) {
    throw new Error("Falta OPENAI_API_KEY");
  }
  return value;
}

function model(): string {
  return process.env.WHATSAPP_AGENT_OPENAI_MODEL?.trim() || "gpt-5-mini";
}

const requiredCommercialEnvironment = [
  "WHATSAPP_META_ACCESS_TOKEN",
  "OPENAI_API_KEY",
  "WHATSAPP_AGENT_SERVICE_TOKEN",
  "WHATSAPP_AGENT_RHINOS_URL",
] as const;

export function getMissingCommercialEnvironment(): string[] {
  return requiredCommercialEnvironment.filter(
    (name) => !process.env[name]?.trim()
  );
}

export function isCommercialAgentConfigured(): boolean {
  return getMissingCommercialEnvironment().length === 0;
}

async function requestModel(
  body: Record<string, unknown>,
  signal?: AbortSignal
): Promise<ModelResponse> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(45_000)])
      : AbortSignal.timeout(45_000),
  });
  if (!response.ok) {
    throw new Error(
      `El modelo no pudo procesar la consulta (${response.status})`
    );
  }
  return (await response.json()) as ModelResponse;
}

async function callCommercialTool(
  context: AgentContext,
  call: ModelFunctionCall,
  signal?: AbortSignal
): Promise<unknown> {
  let args: unknown;
  try {
    args = JSON.parse(call.arguments);
  } catch {
    return { error: "Los argumentos de la herramienta no son válidos" };
  }

  const response = await fetch(
    `${apiBaseUrl()}/api/internal/whatsapp-agent/tools/${call.name}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-whatsapp-agent-token": serviceToken(),
      },
      body: JSON.stringify({ context, arguments: args }),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(20_000)])
        : AbortSignal.timeout(20_000),
    }
  );
  const body = (await response.json()) as { result?: unknown; error?: string };
  return response.ok
    ? body.result
    : { error: body.error ?? "La herramienta no pudo completarse" };
}

async function loadJobContext(supabase: SupabaseClient, job: AgentJob) {
  const [
    { data: organization, error: organizationError },
    { data: integration, error: integrationError },
    { data: conversation, error: conversationError },
    { data: messages, error: messagesError },
  ] = await Promise.all([
    supabase
      .from("organizations")
      .select("name")
      .eq("is_active", true)
      .eq("whatsapp_enabled", true)
      .eq("id", job.organization_id)
      .single(),
    supabase
      .from("whatsapp_integrations")
      .select(
        "phone_number_id, business_hours, response_delay_min_minutes, response_delay_max_minutes"
      )
      .eq("id", job.integration_id)
      .eq("organization_id", job.organization_id)
      .eq("status", "ACTIVE")
      .not("phone_number_id", "like", "rhinos-local-simulator:%")
      .single(),
    supabase
      .from("whatsapp_conversations")
      .select("customer_phone, automation_resumed_at")
      .eq("id", job.conversation_id)
      .eq("organization_id", job.organization_id)
      .eq("integration_id", job.integration_id)
      .eq("status", "ACTIVE")
      .single(),
    supabase
      .from("whatsapp_messages")
      .select("id, direction, message_type, content, created_at")
      .eq("conversation_id", job.conversation_id)
      .eq("organization_id", job.organization_id)
      .eq("integration_id", job.integration_id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(32),
  ]);

  if (
    organizationError ||
    integrationError ||
    conversationError ||
    messagesError ||
    !(organization && integration && conversation)
  ) {
    throw new Error(
      "No se pudo cargar el contexto comercial de la conversación"
    );
  }
  const latestInbound = (messages ?? []).find(
    (message) => message.direction === "INBOUND"
  );
  const superseded =
    !latestInbound || latestInbound.id !== job.source_message_id;
  return {
    superseded,
    audioUnavailable:
      latestInbound?.message_type === "AUDIO" && !latestInbound.content,
    businessName: organization.name as string,
    phoneNumberId: integration.phone_number_id as string,
    recipient: conversation.customer_phone as string,
    messages: ([...(messages ?? [])] as ConversationMessage[]).reverse(),
    businessHours: integration.business_hours as BusinessHours,
    responseDelayMinMinutes: Number(
      integration.response_delay_min_minutes ?? 1
    ),
    responseDelayMaxMinutes: Number(
      integration.response_delay_max_minutes ?? 3
    ),
  };
}

type AgentRun = { id: string };
async function startAgentRun(
  supabase: SupabaseClient,
  job: AgentJob
): Promise<AgentRun> {
  const { data, error } = await supabase
    .from("agent_runs")
    .insert({
      organization_id: job.organization_id,
      integration_id: job.integration_id,
      conversation_id: job.conversation_id,
      agent_job_id: job.id,
      provider: "openai",
      model: model(),
      status: "STARTED",
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(
      `No se pudo iniciar la auditoría del agente: ${error?.message}`
    );
  }
  return data as AgentRun;
}

async function recordAgentRun(
  supabase: SupabaseClient,
  runId: string,
  values: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase
    .from("agent_runs")
    .update(values)
    .eq("id", runId);
  if (error) {
    throw new Error(
      `No se pudo cerrar la auditoría del agente: ${error.message}`
    );
  }
}

type StoredResponse = { text: string; order_prompt: boolean; status: string };

function commercialContext(job: AgentJob): AgentContext {
  return {
    organizationId: job.organization_id,
    integrationId: job.integration_id,
    conversationId: job.conversation_id,
    sourceMessageId: job.source_message_id,
    jobId: job.lease_token ? job.id : undefined,
    leaseToken: job.lease_token,
  };
}

async function readStoredResponse(
  db: SupabaseClient,
  job: AgentJob
): Promise<StoredResponse | null> {
  if (!job.lease_token) {
    return null;
  }
  const result = await db
    .from("whatsapp_outbox")
    .select("text,order_prompt,status")
    .eq("source_message_id", job.source_message_id)
    .eq("organization_id", job.organization_id)
    .maybeSingle();
  if (result.error) {
    throw new Error("No se pudo recuperar el estado del envío.");
  }
  const row = result.data as StoredResponse | null;
  if (row?.status === "SENDING") {
    await db
      .from("whatsapp_outbox")
      .update({ status: "UNKNOWN" })
      .eq("source_message_id", job.source_message_id)
      .eq("status", "SENDING");
    throw new AudioError(
      "DELIVERY_REVIEW",
      "La respuesta anterior requiere revisión antes de continuar."
    );
  }
  if (row?.status === "UNKNOWN") {
    throw new AudioError(
      "DELIVERY_REVIEW",
      "La respuesta anterior requiere revisión antes de continuar."
    );
  }
  return row;
}

async function produceCommercialOutput({
  job,
  context,
  cached,
  audit,
  signal,
}: {
  job: AgentJob;
  context: Awaited<ReturnType<typeof loadJobContext>>;
  cached: StoredResponse | null;
  audit: ToolCallAudit[];
  signal: AbortSignal;
}) {
  if (cached) {
    return {
      text: cached.text,
      orderPrompt: cached.order_prompt,
      usage: undefined as ModelResponse["usage"],
    };
  }
  if (context.audioUnavailable) {
    return {
      text: "No pude transcribir el audio. ¿Podés reenviarlo más claro o escribir el mensaje?",
      orderPrompt: false,
      usage: undefined as ModelResponse["usage"],
    };
  }
  const response = await runCommercialModel({
    model: model(),
    businessName: context.businessName,
    context: commercialContext(job),
    messages: context.messages,
    audit,
    requestModel: (body) => requestModel(body, signal),
    callTool: (toolContext, call) =>
      callCommercialTool(toolContext, call, signal),
  });
  const rendered = (await callCommercialTool(
    commercialContext(job),
    {
      type: "function_call",
      call_id: "render-order",
      name: "render_order_response",
      arguments: JSON.stringify({ text: response.output_text?.trim() || "" }),
    },
    signal
  )) as { text: string; orderPrompt: boolean };
  const text = rendered.text?.trim();
  if (!text) {
    throw new Error("El asistente no produjo una respuesta para el cliente");
  }
  return { text, orderPrompt: rendered.orderPrompt, usage: response.usage };
}

async function processCommercialJob(supabase: SupabaseClient, job: AgentJob) {
  const startedAt = Date.now();
  const toolCalls: ToolCallAudit[] = [];
  let run: AgentRun | null = null;
  try {
    const context = await loadJobContext(supabase, job);
    if (context.superseded) {
      return;
    }
    const now = new Date();
    const responseAt = job.human_delay_applied
      ? getNextBusinessOpening(now, context.businessHours)
      : getNextResponseAt(now, context.businessHours, {
          minMinutes: context.responseDelayMinMinutes,
          maxMinutes: context.responseDelayMaxMinutes,
        });
    if (responseAt) {
      return { deferUntil: responseAt.toISOString() };
    }
    const cached = await readStoredResponse(supabase, job);
    if (cached?.status === "SENT" || cached?.status === "CANCELLED") {
      return;
    }
    run = await startAgentRun(supabase, job);
    const output = await produceCommercialOutput({
      job,
      context,
      cached,
      audit: toolCalls,
      signal: AbortSignal.timeout(90_000),
    });
    await sendWhatsAppText(supabase, {
      integrationId: job.integration_id,
      conversationId: job.conversation_id,
      phoneNumberId: context.phoneNumberId,
      recipient: context.recipient,
      text: output.text,
      sourceMessageId: job.source_message_id,
      orderPrompt: output.orderPrompt,
      jobId: job.lease_token ? job.id : undefined,
      leaseToken: job.lease_token,
    });
    await recordAgentRun(supabase, run.id, {
      status: "SUCCEEDED",
      input_tokens: output.usage?.input_tokens ?? null,
      output_tokens: output.usage?.output_tokens ?? null,
      latency_ms: Date.now() - startedAt,
      tool_calls: toolCalls,
      finished_at: new Date().toISOString(),
    });
    return;
  } catch (error) {
    if (run) {
      await recordAgentRun(supabase, run.id, {
        status: "FAILED",
        error: error instanceof Error ? error.message : "Error desconocido",
        latency_ms: Date.now() - startedAt,
        tool_calls: toolCalls,
        finished_at: new Date().toISOString(),
      }).catch(() => {
        /* Preserve the original failure if audit persistence also fails. */
      });
    }
    throw error;
  }
}

export function createCommercialJobProcessor(
  supabase: SupabaseClient
): AgentJobProcessor {
  return (job) => processCommercialJob(supabase, job);
}

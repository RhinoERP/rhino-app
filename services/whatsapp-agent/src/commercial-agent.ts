import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type AgentContext,
  type ConversationMessage,
  type ModelFunctionCall,
  type ModelResponse,
  runCommercialModel,
  type ToolCallAudit,
} from "./agent-core.js";
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

export function isCommercialAgentConfigured(): boolean {
  return Boolean(
    process.env.WHATSAPP_META_ACCESS_TOKEN &&
      process.env.OPENAI_API_KEY &&
      process.env.WHATSAPP_AGENT_SERVICE_TOKEN &&
      process.env.WHATSAPP_AGENT_RHINOS_URL
  );
}

async function requestModel(
  body: Record<string, unknown>
): Promise<ModelResponse> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
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
  call: ModelFunctionCall
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
      .select("customer_phone")
      .eq("id", job.conversation_id)
      .eq("organization_id", job.organization_id)
      .eq("integration_id", job.integration_id)
      .eq("status", "ACTIVE")
      .single(),
    supabase
      .from("whatsapp_messages")
      .select("direction, content, created_at")
      .eq("conversation_id", job.conversation_id)
      .eq("organization_id", job.organization_id)
      .eq("integration_id", job.integration_id)
      .order("created_at", { ascending: false })
      .limit(16),
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
  return {
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

async function processCommercialJob(supabase: SupabaseClient, job: AgentJob) {
  const startedAt = Date.now();
  const toolCalls: ToolCallAudit[] = [];
  let run: AgentRun | null = null;
  try {
    const jobContext = await loadJobContext(supabase, job);
    const now = new Date();
    const responseAt = job.human_delay_applied
      ? getNextBusinessOpening(now, jobContext.businessHours)
      : getNextResponseAt(now, jobContext.businessHours, {
          minMinutes: jobContext.responseDelayMinMinutes,
          maxMinutes: jobContext.responseDelayMaxMinutes,
        });
    if (responseAt) {
      return { deferUntil: responseAt.toISOString() };
    }

    run = await startAgentRun(supabase, job);
    const response = await runCommercialModel({
      model: model(),
      businessName: jobContext.businessName,
      context: {
        organizationId: job.organization_id,
        integrationId: job.integration_id,
        conversationId: job.conversation_id,
      },
      messages: jobContext.messages,
      audit: toolCalls,
      requestModel,
      callTool: callCommercialTool,
    });
    const text = response.output_text?.trim();
    if (!text) {
      throw new Error("El asistente no produjo una respuesta para el cliente");
    }
    await sendWhatsAppText(supabase, {
      integrationId: job.integration_id,
      conversationId: job.conversation_id,
      phoneNumberId: jobContext.phoneNumberId,
      recipient: jobContext.recipient,
      text,
    });
    await recordAgentRun(supabase, run.id, {
      status: "SUCCEEDED",
      input_tokens: response.usage?.input_tokens ?? null,
      output_tokens: response.usage?.output_tokens ?? null,
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
        // El error original debe conservarse aunque falle la auditoría de falla.
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

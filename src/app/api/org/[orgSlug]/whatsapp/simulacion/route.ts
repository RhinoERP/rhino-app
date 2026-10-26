import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { executeCommercialTool } from "@/modules/whatsapp/server/commercial-tools";
import {
  createLocalSimulatorSession,
  getSimulationMessages,
  getSimulationSnapshot,
  getWhatsAppSimulationOptions,
  recordSimulationMessage,
  type SimulationState,
  verifyLocalSimulatorSession,
} from "@/modules/whatsapp/server/simulation";
import {
  type ConversationMessage,
  type ModelFunctionCall,
  type ModelResponse,
  runCommercialModel,
  type ToolCallAudit,
} from "../../../../../../../services/whatsapp-agent/src/agent-core";

export const runtime = "nodejs";

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
    message: z.string().trim().min(1).max(2000),
    customerId: z.string().uuid().optional(),
    priceListId: z.string().uuid().optional(),
    state: stateSchema.optional(),
  })
  .strict();

function selectedModel(): string {
  return process.env.WHATSAPP_AGENT_OPENAI_MODEL?.trim() || "gpt-5-mini";
}

async function requestModel(
  body: Record<string, unknown>
): Promise<ModelResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "La simulación requiere OPENAI_API_KEY en la configuración del servidor local"
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
    const rawError = await response.text();
    let message = "El modelo no pudo procesar la consulta";
    try {
      const payload = JSON.parse(rawError) as {
        error?: { message?: string; code?: string };
      };
      message = payload.error?.message?.trim() || message;
      if (payload.error?.code) {
        message = `${message} (${payload.error.code})`;
      }
    } catch {
      // Conserva un mensaje seguro si OpenAI no devuelve JSON.
    }
    throw new Error(`${message} [OpenAI ${response.status}]`);
  }
  return (await response.json()) as ModelResponse;
}

async function currentActorId(): Promise<string> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error("Iniciá sesión para usar el simulador");
  }
  return data.user.id;
}

async function runSimulationTurn(params: {
  orgSlug: string;
  organization: { id: string; name: string };
  input: z.infer<typeof requestSchema>;
}) {
  const actorId = await currentActorId();
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

  await recordSimulationMessage({
    state,
    direction: "INBOUND",
    content: params.input.message,
  });
  const messages: ConversationMessage[] = await getSimulationMessages(state);
  const audit: ToolCallAudit[] = [];
  const context = {
    organizationId: params.organization.id,
    integrationId: state.integrationId,
    conversationId: state.conversationId,
    mode: "LOCAL_SIMULATOR" as const,
  };
  const response = await runCommercialModel({
    model: selectedModel(),
    businessName: params.organization.name,
    context,
    messages,
    audit,
    requestModel,
    callTool: async (_context, call: ModelFunctionCall) => {
      try {
        if (call.name === "create_pre_sale") {
          await ensure("sales.manage", params.orgSlug);
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
  const text = response.output_text?.trim();
  if (!text) {
    throw new Error("El asistente no produjo una respuesta para la simulación");
  }

  await recordSimulationMessage({
    state,
    direction: "OUTBOUND",
    content: text,
  });
  return {
    response: text,
    state,
    snapshot: await getSimulationSnapshot(state),
    toolCalls: audit.map(({ name, arguments: args }) => ({
      name,
      arguments: args,
    })),
    usage: response.usage ?? null,
    simulated: true,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orgSlug: string }> }
) {
  const { orgSlug } = await params;
  await ensure("whatsapp.read", orgSlug);
  const organization = await getOrganizationBySlug(orgSlug);
  if (!organization) {
    return NextResponse.json(
      { error: "Organización no encontrada" },
      { status: 404 }
    );
  }
  try {
    const options = await getWhatsAppSimulationOptions(organization.id);
    return NextResponse.json(options);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron cargar los datos reales de la organización",
      },
      { status: 422 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orgSlug: string }> }
) {
  const { orgSlug } = await params;
  await ensure("whatsapp.read", orgSlug);
  await ensure("whatsapp.manage", orgSlug);
  const organization = await getOrganizationBySlug(orgSlug);
  if (!organization) {
    return NextResponse.json(
      { error: "Organización no encontrada" },
      { status: 404 }
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "El cuerpo de la solicitud no es válido" },
      { status: 400 }
    );
  }
  const parsed = requestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ?? "Datos de simulación no válidos",
      },
      { status: 400 }
    );
  }

  try {
    const result = await runSimulationTurn({
      orgSlug,
      organization: { id: organization.id, name: organization.name },
      input: parsed.data,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo procesar la simulación",
      },
      { status: 422 }
    );
  }
}

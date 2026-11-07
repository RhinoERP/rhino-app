import type { SupabaseClient } from "@supabase/supabase-js";
import { AudioError } from "./audio/config.js";

const ARGENTINE_MOBILE_WA_ID = /^549\d{10}$/;

export type SendWhatsAppTextInput = {
  integrationId: string;
  conversationId: string;
  phoneNumberId: string;
  recipient: string;
  text: string;
  sourceMessageId?: string;
  orderPrompt?: boolean;
  jobId?: string;
  leaseToken?: string;
  deliveryLeaseExpiresAt?: string;
};

type DeliveryStatus = "PENDING" | "SENT" | "UNKNOWN" | "CANCELLED";
type FinishDelivery = (
  status: DeliveryStatus,
  externalId?: string
) => Promise<void>;

async function authorizeDelivery(
  supabase: SupabaseClient,
  input: SendWhatsAppTextInput
): Promise<void> {
  // Re-check after model/tool execution: superadmin may have disabled the
  // tenant or a human may have paused the conversation in the meantime.
  const { data: integration, error: integrationError } = await supabase
    .from("whatsapp_integrations")
    .select("organization_id, phone_number_id")
    .eq("id", input.integrationId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (
    integrationError ||
    !integration ||
    integration.phone_number_id !== input.phoneNumberId ||
    input.phoneNumberId.startsWith("rhinos-local-simulator:")
  ) {
    throw new Error("La integración no está disponible para enviar mensajes");
  }
  const [
    { data: organization, error: organizationError },
    { data: conversation, error: conversationError },
  ] = await Promise.all([
    supabase
      .from("organizations")
      .select("id")
      .eq("id", integration.organization_id)
      .eq("is_active", true)
      .eq("whatsapp_enabled", true)
      .maybeSingle(),
    supabase
      .from("whatsapp_conversations")
      .select("id")
      .eq("id", input.conversationId)
      .eq("organization_id", integration.organization_id)
      .eq("integration_id", input.integrationId)
      .eq("customer_phone", input.recipient)
      .in("status", ["ACTIVE", "HANDOFF"])
      .maybeSingle(),
  ]);
  if (
    organizationError ||
    conversationError ||
    !organization ||
    !conversation
  ) {
    throw new Error(
      "El canal está deshabilitado o la conversación fue pausada"
    );
  }
}

async function prepareDelivery(
  db: SupabaseClient,
  input: SendWhatsAppTextInput
) {
  if (!(input.jobId && input.leaseToken && input.sourceMessageId)) {
    throw new Error(
      "El envío requiere un trabajo con lease y outbox persistente."
    );
  }
  const prepared = await db.rpc("prepare_whatsapp_outbox", {
    p_job_id: input.jobId,
    p_lease_token: input.leaseToken,
    p_text: input.text,
    p_order_prompt: input.orderPrompt ?? false,
  });
  if (prepared.error || !prepared.data) {
    throw new Error("No se pudo preparar el envío persistente.");
  }
  if (
    prepared.data.conversation_id !== input.conversationId ||
    prepared.data.integration_id !== input.integrationId ||
    prepared.data.source_message_id !== input.sourceMessageId
  ) {
    throw new Error("La reserva no pertenece al mensaje y canal esperados.");
  }
  if (prepared.data.status === "SENT") {
    return {
      text: prepared.data.text as string,
      sentId: prepared.data.external_message_id as string,
    };
  }
  if (prepared.data.status !== "SENDING") {
    throw new AudioError(
      "DELIVERY_REVIEW",
      "El envío requiere revisión o fue reemplazado por un mensaje posterior."
    );
  }
  return {
    text: prepared.data.text as string,
    deliveryLeaseExpiresAt: prepared.data.lease_expires_at as string,
    sentId: undefined as string | undefined,
  };
}

function rejectionStatus(status: number): DeliveryStatus {
  if (status >= 500) {
    return "UNKNOWN";
  }
  if (status === 429) {
    return "PENDING";
  }
  return "CANCELLED";
}

async function dispatchToMeta(
  input: SendWhatsAppTextInput,
  token: string,
  text: string,
  finish: FinishDelivery
): Promise<string> {
  if (
    !(
      input.deliveryLeaseExpiresAt &&
      Date.parse(input.deliveryLeaseExpiresAt) > Date.now()
    )
  ) {
    throw new AudioError("DELIVERY_REVIEW", "La reserva de envío venció.");
  }
  const recipient = input.recipient;
  const version = process.env.WHATSAPP_META_GRAPH_VERSION ?? "v23.0";
  let response: Response;
  try {
    response = await fetch(
      `https://graph.facebook.com/${version}/${input.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: recipient,
          type: "text",
          text: { body: text },
        }),
        signal: AbortSignal.timeout(20_000),
      }
    );
  } catch {
    await finish("UNKNOWN");
    throw new AudioError(
      "DELIVERY_UNKNOWN",
      "Meta no confirmó el envío. Revisá la conversación antes de reenviarlo."
    );
  }
  if (!response.ok) {
    const rejection = (await response.json().catch(() => null)) as {
      error?: { code?: number };
    } | null;
    const code = rejection?.error?.code;
    // Meta's test-recipient list can store an Argentine mobile without the 9
    // present in inbound wa_id. Only retry an explicitly rejected send; never
    // change the conversation identity or retry an uncertain delivery.
    if (
      response.status === 400 &&
      code === 131_030 &&
      ARGENTINE_MOBILE_WA_ID.test(recipient)
    ) {
      return dispatchToMeta(
        { ...input, recipient: `54${recipient.slice(3)}` },
        token,
        text,
        finish
      );
    }
    await finish(rejectionStatus(response.status));
    throw new AudioError(
      "DELIVERY_REJECTED",
      `Meta rechazó el mensaje saliente (${response.status}${typeof code === "number" ? `; código ${code}` : ""})`,
      502,
      response.status === 429
    );
  }
  const body = (await response.json().catch(() => null)) as {
    messages?: Array<{ id?: string }>;
  } | null;
  const id = body?.messages?.[0]?.id;
  if (!id || typeof id !== "string") {
    await finish("UNKNOWN");
    throw new AudioError(
      "DELIVERY_UNKNOWN",
      "Meta no devolvió un identificador de mensaje. Revisá la conversación."
    );
  }
  return id;
}

export async function sendWhatsAppText(
  supabase: SupabaseClient,
  input: SendWhatsAppTextInput
): Promise<string> {
  const token = process.env.WHATSAPP_META_ACCESS_TOKEN;
  if (!token) {
    throw new Error("Falta WHATSAPP_META_ACCESS_TOKEN");
  }
  await authorizeDelivery(supabase, input);
  const delivery = await prepareDelivery(supabase, input);
  if (delivery.sentId) {
    return delivery.sentId;
  }
  return deliverPreparedText(
    supabase,
    {
      ...input,
      text: delivery.text,
      deliveryLeaseExpiresAt: delivery.deliveryLeaseExpiresAt,
    },
    token
  );
}

async function deliverPreparedText(
  supabase: SupabaseClient,
  input: SendWhatsAppTextInput,
  token: string,
  commandId?: string
): Promise<string> {
  const target = commandId
    ? { p_command_id: commandId }
    : { p_source_message_id: input.sourceMessageId };
  const finish: FinishDelivery = async (status, externalId) => {
    // A known Meta ID is retried only here: never repeat the provider POST.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const result = await supabase.rpc(
          commandId ? "complete_whatsapp_command" : "complete_whatsapp_outbox",
          {
            ...target,
            p_lease_token: input.leaseToken,
            p_status: status,
            p_external_message_id: externalId || null,
          }
        );
        if (!result.error && result.data === true) {
          return;
        }
      } catch {
        // Retry persistence, including an acknowledgement lost after commit.
      }
    }
    throw new AudioError(
      "DELIVERY_PERSISTENCE",
      "No se pudo registrar el resultado del envío; requiere revisión."
    );
  };
  const id = await dispatchToMeta(input, token, input.text, finish);
  await finish("SENT", id);
  return id;
}

export async function sendNextWhatsAppHumanMessage(
  db: SupabaseClient
): Promise<boolean> {
  const token = process.env.WHATSAPP_META_ACCESS_TOKEN;
  if (!token) {
    throw new Error("Falta WHATSAPP_META_ACCESS_TOKEN");
  }
  const { data: command, error } = await db.rpc("claim_whatsapp_human_outbox");
  if (error) {
    throw new Error("No se pudo reservar un envío humano");
  }
  if (!command) {
    return false;
  }
  const input: SendWhatsAppTextInput = {
    integrationId: command.integration_id,
    conversationId: command.conversation_id,
    phoneNumberId: command.phone_number_id,
    recipient: command.recipient,
    text: command.text,
    leaseToken: command.lease_token,
    deliveryLeaseExpiresAt: command.lease_expires_at,
  };
  // The SQL reservation has already checked actor, version, flags and window.
  // Any failure after reserving is left fenced, then recovered as UNKNOWN.
  await authorizeDelivery(db, input);
  await deliverPreparedText(db, input, token, command.id);
  return true;
}

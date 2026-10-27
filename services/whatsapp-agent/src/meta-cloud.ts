import type { SupabaseClient } from "@supabase/supabase-js";

export type SendWhatsAppTextInput = {
  integrationId: string;
  conversationId: string;
  phoneNumberId: string;
  recipient: string;
  text: string;
  sourceMessageId?: string;
  orderPrompt?: boolean;
};

type MetaSendResponse = { messages?: Array<{ id?: string }> };

export async function sendWhatsAppText(
  supabase: SupabaseClient,
  input: SendWhatsAppTextInput
): Promise<string> {
  const token = process.env.WHATSAPP_META_ACCESS_TOKEN;
  if (!token) {
    throw new Error("Falta WHATSAPP_META_ACCESS_TOKEN");
  }

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

  const version = process.env.WHATSAPP_META_GRAPH_VERSION ?? "v23.0";
  const response = await fetch(
    `https://graph.facebook.com/${version}/${input.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: input.recipient,
        type: "text",
        text: { body: input.text },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Meta rechazó el mensaje saliente (${response.status})`);
  }
  const responseBody = (await response.json()) as MetaSendResponse;
  const externalMessageId = responseBody.messages?.[0]?.id;
  if (!externalMessageId) {
    throw new Error("Meta no devolvió un identificador de mensaje");
  }

  const { error } = await supabase.rpc("record_whatsapp_outbound_message", {
    p_conversation_id: input.conversationId,
    p_integration_id: input.integrationId,
    p_external_message_id: externalMessageId,
    p_message_type: "TEXT",
    p_content: input.text,
    p_payload: {
      provider: "META_CLOUD",
      sourceMessageId: input.sourceMessageId,
      orderPrompt: input.orderPrompt ?? false,
    },
  });
  if (error) {
    throw new Error(
      `No se pudo registrar el mensaje saliente: ${error.message}`
    );
  }

  return externalMessageId;
}

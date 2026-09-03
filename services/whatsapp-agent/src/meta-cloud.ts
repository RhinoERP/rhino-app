import type { SupabaseClient } from "@supabase/supabase-js";

export type SendWhatsAppTextInput = {
  integrationId: string;
  conversationId: string;
  phoneNumberId: string;
  recipient: string;
  text: string;
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
    p_payload: { provider: "META_CLOUD" },
  });
  if (error) {
    throw new Error(
      `No se pudo registrar el mensaje saliente: ${error.message}`
    );
  }

  return externalMessageId;
}

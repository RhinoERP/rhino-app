"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { createWhatsAppAdminClient } from "../server/supabase-admin";

const inputSchema = z.object({
  orgSlug: z.string().trim().min(1),
  conversationId: z.string().uuid(),
  text: z.string().trim().min(1).max(4000),
});

export async function sendWhatsAppManualMessageAction(input: unknown): Promise<{
  success: boolean;
  error?: string;
}> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "El mensaje no es válido" };
  }
  try {
    await ensure("whatsapp.manage", parsed.data.orgSlug);
    const organization = await getOrganizationBySlug(parsed.data.orgSlug);
    if (!organization) {
      return { success: false, error: "Organización no encontrada" };
    }
    const token = process.env.WHATSAPP_META_ACCESS_TOKEN;
    if (!token) {
      return { success: false, error: "Falta configurar el envío de WhatsApp" };
    }
    const supabase = createWhatsAppAdminClient();
    const { data: conversation, error: conversationError } = await supabase
      .from("whatsapp_conversations")
      .select("id, integration_id, customer_phone")
      .eq("id", parsed.data.conversationId)
      .eq("organization_id", organization.id)
      .in("status", ["ACTIVE", "PAUSED", "HANDOFF"])
      .maybeSingle();
    if (conversationError || !conversation) {
      return { success: false, error: "La conversación no está disponible" };
    }
    const { data: integration, error: integrationError } = await supabase
      .from("whatsapp_integrations")
      .select("id, phone_number_id")
      .eq("id", conversation.integration_id)
      .eq("organization_id", organization.id)
      .eq("status", "ACTIVE")
      .maybeSingle();
    if (integrationError || !integration) {
      return { success: false, error: "La integración no está activa" };
    }
    const version = process.env.WHATSAPP_META_GRAPH_VERSION ?? "v23.0";
    const response = await fetch(
      `https://graph.facebook.com/${version}/${integration.phone_number_id}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: conversation.customer_phone,
          type: "text",
          text: { body: parsed.data.text },
        }),
      }
    );
    const payload = (await response.json()) as {
      messages?: Array<{ id?: string }>;
    };
    const externalMessageId = payload.messages?.[0]?.id;
    if (!(response.ok && externalMessageId)) {
      return { success: false, error: "Meta no pudo enviar el mensaje" };
    }
    const { error: recordError } = await supabase.rpc(
      "record_whatsapp_outbound_message",
      {
        p_conversation_id: conversation.id,
        p_integration_id: integration.id,
        p_external_message_id: externalMessageId,
        p_message_type: "TEXT",
        p_content: parsed.data.text,
        p_payload: { source: "MANUAL" },
      }
    );
    if (recordError) {
      return {
        success: false,
        error: "El mensaje fue enviado pero no se pudo registrar",
      };
    }
    revalidatePath(`/org/${parsed.data.orgSlug}/whatsapp/conversaciones`);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "No se pudo enviar el mensaje",
    };
  }
}

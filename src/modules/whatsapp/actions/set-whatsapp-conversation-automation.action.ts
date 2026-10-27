"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { assertWhatsAppEnabled } from "../server/access";
import { isLocalSimulatorIntegration } from "../server/simulation";
import { createWhatsAppAdminClient } from "../server/supabase-admin";

const inputSchema = z.object({
  orgSlug: z.string().trim().min(1),
  conversationId: z.string().uuid(),
  enabled: z.boolean(),
});

export async function setWhatsAppConversationAutomationAction(
  input: unknown
): Promise<{ success: boolean; error?: string }> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "La conversación no es válida" };
  }
  try {
    const [organization, sessionClient] = await Promise.all([
      getOrganizationBySlug(parsed.data.orgSlug),
      createClient(),
    ]);
    if (!organization) {
      return { success: false, error: "Organización no encontrada" };
    }
    const {
      data: { user },
    } = await sessionClient.auth.getUser();
    if (!user) {
      return { success: false, error: "No autenticado" };
    }
    const supabase = createWhatsAppAdminClient();
    const { data: conversation } = await supabase
      .from("whatsapp_conversations")
      .select("integration_id")
      .eq("id", parsed.data.conversationId)
      .eq("organization_id", organization.id)
      .single();
    if (!conversation) {
      return { success: false, error: "La conversación no está disponible" };
    }
    const { data: integration } = await supabase
      .from("whatsapp_integrations")
      .select("phone_number_id")
      .eq("id", conversation.integration_id)
      .eq("organization_id", organization.id)
      .single();
    if (!integration) {
      return { success: false, error: "La integración no está disponible" };
    }
    const mode = isLocalSimulatorIntegration(integration.phone_number_id)
      ? "whatsapp_sandbox"
      : "whatsapp";
    await ensure("whatsapp.manage", parsed.data.orgSlug, mode);
    await assertWhatsAppEnabled(organization.id, mode);
    const { error } = await supabase.rpc("set_whatsapp_automation", {
      p_organization_id: organization.id,
      p_conversation_id: parsed.data.conversationId,
      p_enabled: parsed.data.enabled,
      p_actor_id: user.id,
    });
    if (error) {
      return {
        success: false,
        error: "No se pudo actualizar la automatización",
      };
    }
    revalidatePath(`/org/${parsed.data.orgSlug}/whatsapp/conversaciones`);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo actualizar la automatización",
    };
  }
}

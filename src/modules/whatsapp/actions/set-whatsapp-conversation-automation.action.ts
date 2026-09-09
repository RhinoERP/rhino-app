"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
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
    await ensure("whatsapp.manage", parsed.data.orgSlug);
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
    const { error } = await supabase
      .from("whatsapp_conversations")
      .update(
        parsed.data.enabled
          ? {
              status: "ACTIVE",
              handoff_reason: null,
              bot_paused_at: null,
              bot_paused_by: null,
            }
          : {
              status: "PAUSED",
              bot_paused_at: new Date().toISOString(),
              bot_paused_by: user.id,
            }
      )
      .eq("id", parsed.data.conversationId)
      .eq("organization_id", organization.id)
      .in("status", ["ACTIVE", "PAUSED", "HANDOFF"]);
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

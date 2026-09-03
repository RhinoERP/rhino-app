"use server";

import { revalidatePath } from "next/cache";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { whatsappIntegrationConfigurationSchema } from "../schemas";
import { saveWhatsAppIntegrationByOrgSlug } from "../service/whatsapp-integrations.service";
import type { WhatsAppIntegration } from "../types";

type SaveWhatsAppIntegrationResult = {
  success: boolean;
  data?: WhatsAppIntegration;
  error?: string;
};

export async function saveWhatsAppIntegrationAction(
  orgSlug: string,
  input: unknown
): Promise<SaveWhatsAppIntegrationResult> {
  try {
    await ensure("whatsapp.configure", orgSlug);

    const parsed = whatsappIntegrationConfigurationSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }

    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "No autenticado" };
    }

    const data = await saveWhatsAppIntegrationByOrgSlug(
      orgSlug,
      parsed.data,
      user.id
    );

    revalidatePath(`/org/${orgSlug}/whatsapp/configuracion`);
    revalidatePath(`/org/${orgSlug}/configuracion`);

    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo guardar la integración de WhatsApp",
    };
  }
}

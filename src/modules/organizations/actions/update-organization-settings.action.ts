"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  type OrganizationSettingsData,
  organizationSettingsSchema,
} from "../types/organization-settings";

type ActionResult = {
  success: boolean;
  error?: string;
};

export async function updateOrganizationSettings(
  orgSlug: string,
  settings: OrganizationSettingsData
): Promise<ActionResult> {
  try {
    const validated = organizationSettingsSchema.parse(settings);

    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { success: false, error: "No autenticado" };
    }

    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", orgSlug)
      .single();

    if (orgError || !org) {
      return { success: false, error: "Organización no encontrada" };
    }

    const { error: upsertError } = await supabase
      .from("organization_settings")
      .upsert(
        {
          organization_id: org.id,
          settings: validated,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id" }
      );

    if (upsertError) {
      return { success: false, error: "Error al guardar la configuración" };
    }

    revalidatePath(`/org/${orgSlug}/configuracion`);
    revalidatePath(`/org/${orgSlug}/configuracion/comprobantes`);
    revalidatePath(`/org/${orgSlug}/configuracion/emails-de-factura`);

    return { success: true };
  } catch {
    return { success: false, error: "Error inesperado" };
  }
}

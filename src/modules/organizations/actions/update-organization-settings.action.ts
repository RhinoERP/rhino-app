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
  patch: Partial<OrganizationSettingsData>
): Promise<ActionResult> {
  try {
    const validated = organizationSettingsSchema.partial().parse(patch);

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

    // Read current settings, merge patch, write back (preserves unrelated keys)
    const { data: existing } = await supabase
      .from("organization_settings")
      .select("settings")
      .eq("organization_id", org.id)
      .maybeSingle();

    const current =
      typeof existing?.settings === "object" &&
      existing?.settings !== null &&
      !Array.isArray(existing?.settings)
        ? (existing.settings as Record<string, unknown>)
        : {};

    const merged = { ...current, ...validated };

    const { error: upsertError } = await supabase
      .from("organization_settings")
      .upsert(
        {
          organization_id: org.id,
          settings: merged,
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

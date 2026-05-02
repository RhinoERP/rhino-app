"use server";

import { createClient } from "@/lib/supabase/server";
import {
  ORGANIZATION_SETTINGS_DEFAULTS,
  type OrganizationSettingsData,
  organizationSettingsSchema,
} from "../types/organization-settings";

type ActionResult = {
  success: boolean;
  data?: OrganizationSettingsData;
  error?: string;
};

export async function getOrganizationSettings(
  orgSlug: string
): Promise<ActionResult> {
  try {
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

    const { data: row } = await supabase
      .from("organization_settings")
      .select("settings")
      .eq("organization_id", org.id)
      .maybeSingle();

    // No row yet → return defaults (lazy initialization)
    const parsed = organizationSettingsSchema.safeParse(row?.settings ?? {});

    return {
      success: true,
      data: parsed.success ? parsed.data : ORGANIZATION_SETTINGS_DEFAULTS,
    };
  } catch {
    return { success: false, error: "Error al obtener la configuración" };
  }
}

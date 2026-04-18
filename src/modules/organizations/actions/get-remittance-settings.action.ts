"use server";

import { createClient } from "@/lib/supabase/server";

export type RemittanceSettings = {
  autoEnabled: boolean;
  prefix: string;
  lastNumber: number;
};

type ActionResult = {
  success: boolean;
  data?: RemittanceSettings;
  error?: string;
};

export async function getRemittanceSettings(
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
      .select(
        "remittance_auto_enabled, remittance_prefix, remittance_last_number"
      )
      .eq("slug", orgSlug)
      .single();

    if (orgError || !org) {
      return { success: false, error: "Organización no encontrada" };
    }

    return {
      success: true,
      data: {
        autoEnabled: org.remittance_auto_enabled,
        prefix: org.remittance_prefix,
        lastNumber: org.remittance_last_number,
      },
    };
  } catch {
    return { success: false, error: "Error al obtener la configuración" };
  }
}

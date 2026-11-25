"use server";

import { createClient } from "@/lib/supabase/server";
import { getOrganizationSettings } from "./get-organization-settings.action";

type ActionResult = {
  success: boolean;
  number?: string;
  error?: string;
};

export async function generateRemittanceNumber(
  orgSlug: string
): Promise<ActionResult> {
  try {
    const settings = await getOrganizationSettings(orgSlug);
    if (!settings.success) {
      return { success: false, error: settings.error };
    }
    if (settings.data?.remittance_fiscal_enabled) {
      return {
        success: false,
        error:
          "El número fiscal se asigna al confirmar el despacho con remitos.",
      };
    }
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

    const { data, error } = await supabase.rpc("generate_remittance_number", {
      org_id: org.id,
    });

    if (error || !data) {
      return {
        success: false,
        error: "No se pudo generar el número de remito",
      };
    }

    return { success: true, number: data };
  } catch {
    return { success: false, error: "Error inesperado" };
  }
}

/**
 * Update Organization Report Settings Action
 * Allows organization members to configure monthly email report preferences
 */

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Validation schema
const reportSettingsSchema = z.object({
  monthlyReportEnabled: z.boolean(),
  monthlyReportDayOfWeek: z
    .number()
    .min(1, "El día debe estar entre 1 (Lunes) y 7 (Domingo)")
    .max(7, "El día debe estar entre 1 (Lunes) y 7 (Domingo)")
    .nullable(),
});

export type ReportSettingsInput = z.infer<typeof reportSettingsSchema>;

type ActionResult = {
  success: boolean;
  error?: string;
};

export async function updateOrganizationReportSettings(
  orgSlug: string,
  settings: ReportSettingsInput
): Promise<ActionResult> {
  try {
    // Validate input
    const validatedSettings = reportSettingsSchema.parse(settings);

    // Validate that if enabled, day of week must be set
    if (
      validatedSettings.monthlyReportEnabled &&
      !validatedSettings.monthlyReportDayOfWeek
    ) {
      return {
        success: false,
        error: "Debes seleccionar un día de la semana para el reporte mensual",
      };
    }

    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        success: false,
        error: "No autenticado",
      };
    }

    // Get organization by slug
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", orgSlug)
      .single();

    if (orgError || !org) {
      return {
        success: false,
        error: "Organización no encontrada",
      };
    }

    // Update organization settings
    const { error: updateError } = await supabase
      .from("organizations")
      .update({
        monthly_report_enabled: validatedSettings.monthlyReportEnabled,
        monthly_report_day_of_week: validatedSettings.monthlyReportDayOfWeek,
      })
      .eq("id", org.id);

    if (updateError) {
      console.error("Error updating report settings:", updateError);
      return {
        success: false,
        error: `Error al actualizar: ${updateError.message}`,
      };
    }

    // Revalidate the dashboard page
    revalidatePath(`/org/${orgSlug}/torre-de-control`);

    return {
      success: true,
    };
  } catch (error) {
    console.error("Error in updateOrganizationReportSettings:", error);

    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues[0]?.message ?? "Datos inválidos",
      };
    }

    return {
      success: false,
      error: "Error inesperado al actualizar la configuración",
    };
  }
}

/**
 * Get Organization Report Settings Action
 * Retrieves current monthly report configuration for an organization
 */

"use server";

import { createClient } from "@/lib/supabase/server";

export type ReportSettings = {
  monthlyReportEnabled: boolean;
  monthlyReportDayOfWeek: number | null;
};

type ActionResult = {
  success: boolean;
  data?: ReportSettings;
  error?: string;
};

export async function getOrganizationReportSettings(
  orgSlug: string
): Promise<ActionResult> {
  try {
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

    // Get organization settings
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("monthly_report_enabled, monthly_report_day_of_week")
      .eq("slug", orgSlug)
      .single();

    if (orgError || !org) {
      return {
        success: false,
        error: "Organización no encontrada",
      };
    }

    return {
      success: true,
      data: {
        monthlyReportEnabled: org.monthly_report_enabled,
        monthlyReportDayOfWeek: org.monthly_report_day_of_week,
      },
    };
  } catch (error) {
    console.error("Error in getOrganizationReportSettings:", error);
    return {
      success: false,
      error: "Error al obtener la configuración del reporte",
    };
  }
}

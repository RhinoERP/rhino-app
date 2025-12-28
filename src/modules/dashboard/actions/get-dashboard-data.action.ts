"use server";

/**
 * Dashboard Actions
 * Server Actions para obtener datos del dashboard
 */

import { getDashboardData } from "../service/dashboard.service";
import type { GetDashboardDataParams, GetDashboardDataResult } from "../types";

export async function getDashboardDataAction(
  params: GetDashboardDataParams
): Promise<GetDashboardDataResult> {
  try {
    const data = await getDashboardData(
      params.orgSlug,
      params.startDate,
      params.endDate
    );

    return {
      success: true,
      data,
    };
  } catch (error) {
    console.error("Error getting dashboard data:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Error desconocido",
    };
  }
}

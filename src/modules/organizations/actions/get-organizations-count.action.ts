"use server";

import { isSuperAdmin } from "@/lib/supabase/admin";
import { getOrganizationsCount } from "../service/organizations.service";

/**
 * Server action to get organizations count
 * Validates that the current user is a superadmin
 */
export async function getOrganizationsCountAction() {
  try {
    const isAdmin = await isSuperAdmin();
    if (!isAdmin) {
      return {
        success: false,
        error: "Unauthorized: Only superadmins can view organizations",
        count: 0,
      };
    }

    const count = await getOrganizationsCount();

    return {
      success: true,
      count,
    };
  } catch (error) {
    console.error("Error fetching organizations count:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al obtener el conteo de organizaciones",
      count: 0,
    };
  }
}

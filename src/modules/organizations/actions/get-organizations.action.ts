"use server";

import { isSuperAdmin } from "@/lib/supabase/admin";
import { getAllOrganizations } from "../service/organizations.service";

/**
 * Server action to get all organizations
 * Validates that the current user is a superadmin
 */
export async function getOrganizationsAction() {
  try {
    const isAdmin = await isSuperAdmin();
    if (!isAdmin) {
      return {
        success: false,
        error: "Unauthorized: Only superadmins can view organizations",
        organizations: [],
      };
    }

    const organizations = await getAllOrganizations();

    return {
      success: true,
      organizations,
    };
  } catch (error) {
    console.error("Error fetching organizations:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al obtener las organizaciones",
      organizations: [],
    };
  }
}

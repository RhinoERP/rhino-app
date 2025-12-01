"use server";

import { isSuperAdmin } from "@/lib/supabase/admin";
import type { Database } from "@/types/supabase";
import { createOrganizationWithAdmin } from "../service/organization.service";

type Organization = Database["public"]["Tables"]["organizations"]["Row"];

export type CreateOrganizationActionResult = {
  success: boolean;
  error?: string;
  organizationId?: string;
  organization?: Organization;
};

/**
 * Server action to create an organization with admin user
 * Validates that the current user is a superadmin
 */
export async function createOrganizationAction(
  orgName: string,
  adminEmail: string,
  cuit: string
): Promise<CreateOrganizationActionResult> {
  try {
    // Verify that the user is a superadmin
    const isAdmin = await isSuperAdmin();
    if (!isAdmin) {
      return {
        success: false,
        error: "Unauthorized: Only superadmins can create organizations",
      };
    }

    // Validate inputs
    if (!orgName?.trim()) {
      return {
        success: false,
        error: "El nombre de la organización es requerido",
      };
    }

    if (!adminEmail?.trim()) {
      return {
        success: false,
        error: "El email del administrador es requerido",
      };
    }

    if (!cuit?.trim()) {
      return {
        success: false,
        error: "El CUIT es requerido",
      };
    }

    // Create the organization
    const result = await createOrganizationWithAdmin({
      orgName: orgName.trim(),
      adminEmail: adminEmail.trim(),
      cuit: cuit.trim(),
    });

    return {
      success: true,
      organizationId: result.organizationId,
      organization: result.organization,
    };
  } catch (error) {
    console.error("Error creating organization:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al crear la organización",
    };
  }
}

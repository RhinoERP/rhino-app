"use server";

import { isSuperAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sendInvitationEmail } from "@/modules/email/service/send-invitation-email";
import type { Organization } from "@/modules/organizations/types";
import { createOrganizationWithAdmin } from "../service/organization.service";

export type CreateOrganizationActionResult = {
  success: boolean;
  error?: string;
  organizationId?: string;
  invitationToken?: string;
  organization?: Organization;
};

export async function createOrganizationAction(
  orgName: string,
  adminEmail: string,
  cuit: string
): Promise<CreateOrganizationActionResult> {
  try {
    const isAdmin = await isSuperAdmin();
    if (!isAdmin) {
      return {
        success: false,
        error: "Unauthorized: Only superadmins can create organizations",
      };
    }

    const supabaseClient = await createClient();

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

    const result = await createOrganizationWithAdmin({
      orgName: orgName.trim(),
      adminEmail: adminEmail.trim(),
      cuit: cuit.trim(),
      supabaseClient,
    });

    try {
      const { data: role } = await supabaseClient
        .from("roles")
        .select("id")
        .eq("organization_id", result.organizationId)
        .eq("key", "admin")
        .single();

      await sendInvitationEmail({
        to: adminEmail.trim(),
        organizationName: result.organization.name,
        invitationToken: result.invitationToken,
        roleId: role?.id,
      });
    } catch (emailError) {
      console.error("Error sending invitation email:", emailError);
      return {
        success: true,
        organizationId: result.organizationId,
        invitationToken: result.invitationToken,
        organization: result.organization,
        error: `Organización creada exitosamente, pero hubo un error al enviar el email: ${emailError instanceof Error ? emailError.message : "Error desconocido"}`,
      };
    }

    return {
      success: true,
      organizationId: result.organizationId,
      invitationToken: result.invitationToken,
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

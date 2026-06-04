"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isSuperAdmin } from "@/lib/supabase/admin";
import { createAdminClient } from "@/lib/supabase/admin-client";

const organizationModulesSchema = z.object({
  wholesaleEnabled: z.boolean(),
  posEnabled: z.boolean(),
  supplierDifferentiatedCredits: z.boolean(),
});

type OrganizationModulesInput = z.infer<typeof organizationModulesSchema>;

type UpdateOrganizationModulesActionResult = {
  success: boolean;
  error?: string;
};

export async function updateOrganizationModulesAction(
  organizationId: string,
  input: OrganizationModulesInput,
  orgSlug?: string
): Promise<UpdateOrganizationModulesActionResult> {
  const isAdmin = await isSuperAdmin();
  if (!isAdmin) {
    return {
      success: false,
      error: "No tienes permisos para realizar esta acción",
    };
  }

  const parsedInput = organizationModulesSchema.safeParse(input);
  if (!parsedInput.success) {
    return {
      success: false,
      error: "Configuración de módulos inválida",
    };
  }

  const supabase = createAdminClient();

  const { error } = await supabase
    .from("organizations")
    .update({
      wholesale_enabled: parsedInput.data.wholesaleEnabled,
      pos_enabled: parsedInput.data.posEnabled,
      supplier_differentiated_credits:
        parsedInput.data.supplierDifferentiatedCredits,
    })
    .eq("id", organizationId);

  if (error) {
    console.error("Error updating organization modules:", error);
    return {
      success: false,
      error: "Error al actualizar la configuración de módulos",
    };
  }

  revalidatePath("/admin");
  if (orgSlug) {
    revalidatePath(`/admin/organizacion/${orgSlug}`);
    revalidatePath(`/org/${orgSlug}`);
    revalidatePath(`/org/${orgSlug}/ventas`);
    revalidatePath(`/org/${orgSlug}/venta-directa`);
    revalidatePath(`/org/${orgSlug}/cobranzas`);
  }

  return {
    success: true,
  };
}

"use server";

import { revalidatePath } from "next/cache";
import { isSuperAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function toggleOrganizationStatusAction(
  organizationId: string,
  isActive: boolean
): Promise<{
  success: boolean;
  error?: string;
}> {
  // Verify user is admin
  const isAdmin = await isSuperAdmin();
  if (!isAdmin) {
    return {
      success: false,
      error: "No tienes permisos para realizar esta acción",
    };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("organizations")
    .update({ is_active: isActive })
    .eq("id", organizationId);

  if (error) {
    console.error("Error updating organization status:", error);
    return {
      success: false,
      error: "Error al actualizar el estado de la organización",
    };
  }

  revalidatePath("/admin");

  return {
    success: true,
  };
}

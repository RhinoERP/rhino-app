"use server";

import { revalidatePath } from "next/cache";
import { isSuperAdmin } from "@/lib/supabase/admin";
import { createAdminClient } from "@/lib/supabase/admin-client";

export async function toggleOrganizationStatusAction(
  organizationId: string,
  isActive: boolean,
  orgSlug?: string
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

  // Use admin client to bypass RLS
  const supabase = createAdminClient();

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

  // Revalidate admin paths
  revalidatePath("/admin");
  if (orgSlug) {
    revalidatePath(`/admin/organizacion/${orgSlug}`);
  }

  return {
    success: true,
  };
}

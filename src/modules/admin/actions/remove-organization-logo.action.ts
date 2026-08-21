"use server";

import { revalidatePath } from "next/cache";
import { isSuperAdmin } from "@/lib/supabase/admin";
import { createAdminClient } from "@/lib/supabase/admin-client";

const BUCKET = "organization-logos";

type RemoveOrganizationLogoResult =
  | { success: true }
  | { success: false; error: string };

export async function removeOrganizationLogoAction(
  orgId: string,
  orgSlug: string
): Promise<RemoveOrganizationLogoResult> {
  try {
    const isAdmin = await isSuperAdmin();
    if (!isAdmin) {
      return { success: false, error: "No autorizado" };
    }

    const supabase = createAdminClient();

    const { data: existingFiles } = await supabase.storage
      .from(BUCKET)
      .list(orgSlug);

    if (existingFiles && existingFiles.length > 0) {
      await supabase.storage
        .from(BUCKET)
        .remove(existingFiles.map((f) => `${orgSlug}/${f.name}`));
    }

    const { error: updateError } = await supabase
      .from("organizations")
      .update({ logo_url: null })
      .eq("id", orgId);

    if (updateError) {
      return {
        success: false,
        error: `Error al actualizar la organización: ${updateError.message}`,
      };
    }

    revalidatePath(`/admin/organizacion/${orgSlug}`);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al eliminar el logo",
    };
  }
}

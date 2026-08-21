"use server";

import { revalidatePath } from "next/cache";
import { isSuperAdmin } from "@/lib/supabase/admin";
import { createAdminClient } from "@/lib/supabase/admin-client";

const BUCKET = "organization-logos";
const MAX_SIZE = 1024 * 1024;
const ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp"];

type UploadOrganizationLogoResult =
  | { success: true; logoUrl: string }
  | { success: false; error: string };

export async function uploadOrganizationLogoAction(
  orgId: string,
  orgSlug: string,
  formData: FormData
): Promise<UploadOrganizationLogoResult> {
  try {
    const isAdmin = await isSuperAdmin();
    if (!isAdmin) {
      return { success: false, error: "No autorizado" };
    }

    const file = formData.get("file") as File | null;
    if (!file) {
      return { success: false, error: "No se proporcionó un archivo" };
    }

    if (!ALLOWED_MIME.includes(file.type)) {
      return {
        success: false,
        error: "Formato no válido. Formatos aceptados: PNG, JPG, WebP",
      };
    }

    if (file.size > MAX_SIZE) {
      return {
        success: false,
        error: "El archivo no puede superar 1MB",
      };
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

    const ext = file.type.split("/")[1].replace("jpeg", "jpg");
    const filePath = `${orgSlug}/logo.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, file, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      return {
        success: false,
        error: `Error al subir el archivo: ${uploadError.message}`,
      };
    }

    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(filePath);

    const logoUrl = `${urlData.publicUrl}?v=${Date.now()}`;

    const { error: updateError } = await supabase
      .from("organizations")
      .update({ logo_url: logoUrl })
      .eq("id", orgId);

    if (updateError) {
      return {
        success: false,
        error: `Error al actualizar la organización: ${updateError.message}`,
      };
    }

    revalidatePath(`/admin/organizacion/${orgSlug}`);

    return { success: true, logoUrl };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al subir el logo",
    };
  }
}

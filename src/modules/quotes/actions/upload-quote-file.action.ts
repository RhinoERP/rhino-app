"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";

const BUCKET = "purchase-orders";
const MAX_SIZE = 10 * 1024 * 1024;

const SUBFOLDER: Record<string, string> = {
  purchase_order: "purchase_orders",
  design: "designs",
};

const ALLOWED_MIME: Record<string, string[]> = {
  purchase_order: ["application/pdf"],
  design: ["application/pdf", "image/png", "image/jpeg"],
};

type UploadInput = {
  file: File;
  orgSlug: string;
  quoteId: string;
  type: "purchase_order" | "design";
  oldFileUrl: string | null;
};

function sanitizeFileName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function parseInput(formData: FormData): UploadInput | { error: string } {
  const file = formData.get("file") as File | null;
  const orgSlug = formData.get("orgSlug") as string | null;
  const quoteId = formData.get("quoteId") as string | null;
  const type = formData.get("type") as string | null;

  if (!file) {
    return { error: "No se proporcionó un archivo" };
  }
  if (!orgSlug) {
    return { error: "Organización no especificada" };
  }
  if (!quoteId) {
    return { error: "ID del presupuesto no especificado" };
  }
  if (type !== "purchase_order" && type !== "design") {
    return {
      error: "Tipo de archivo inválido. Use 'purchase_order' o 'design'",
    };
  }

  const allowed = ALLOWED_MIME[type];
  if (!allowed.includes(file.type)) {
    const typeLabel = type === "purchase_order" ? "orden de compra" : "boceto";
    const formats = allowed
      .map((m) => m.split("/")[1].toUpperCase())
      .join(", ");
    return {
      error: `Formato no válido para ${typeLabel}. Formatos aceptados: ${formats}`,
    };
  }

  if (file.size > MAX_SIZE) {
    return { error: "El archivo no puede superar los 10MB" };
  }

  const oldFileUrl = (formData.get("oldFileUrl") as string | null) ?? null;
  return { file, orgSlug, quoteId, type, oldFileUrl };
}

async function deleteOldFileByUrl(
  supabase: SupabaseClient,
  url: string
): Promise<void> {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/");
    const bucketIndex = parts.indexOf(BUCKET);
    if (bucketIndex !== -1 && bucketIndex < parts.length - 1) {
      const oldPath = parts.slice(bucketIndex + 1).join("/");
      await supabase.storage.from(BUCKET).remove([oldPath]);
    }
  } catch {
    // ignore parse errors for old URLs
  }
}

async function cleanSubfolder(
  supabase: SupabaseClient,
  folderPath: string
): Promise<string | null> {
  const { data: existingFiles, error: listError } = await supabase.storage
    .from(BUCKET)
    .list(folderPath);

  if (listError) {
    return `Error al listar archivos existentes: ${listError.message}`;
  }
  if (!existingFiles || existingFiles.length === 0) {
    return null;
  }

  const filesToDelete = existingFiles.map((f) => `${folderPath}/${f.name}`);
  const { error: removeError } = await supabase.storage
    .from(BUCKET)
    .remove(filesToDelete);

  return removeError
    ? `Error al eliminar archivos anteriores: ${removeError.message}`
    : null;
}

async function uploadFile(
  supabase: SupabaseClient,
  folderPath: string,
  file: File
): Promise<string | { error: string }> {
  const originalName = sanitizeFileName(file.name);
  const filePath = `${folderPath}/${originalName}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, file, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    return { error: `Error al subir el archivo: ${uploadError.message}` };
  }

  const { data: urlData } = await supabase.storage
    .from(BUCKET)
    .getPublicUrl(filePath);

  return urlData.publicUrl;
}

export type UploadQuoteFileResult = {
  success: boolean;
  url?: string;
  error?: string;
};

export async function uploadQuoteFileAction(
  formData: FormData
): Promise<UploadQuoteFileResult> {
  await ensure("quotes.manage", formData.get("orgSlug") as string);
  try {
    const parsed = parseInput(formData);
    if ("error" in parsed) {
      return { success: false, error: parsed.error };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: "No autorizado" };
    }

    const { file, orgSlug, quoteId, type, oldFileUrl } = parsed;

    const subfolder = SUBFOLDER[type];
    const folderPath = `${orgSlug}/${quoteId}/${subfolder}`;

    if (oldFileUrl) {
      await deleteOldFileByUrl(supabase, oldFileUrl);
    }

    const folderError = await cleanSubfolder(supabase, folderPath);
    if (folderError) {
      return { success: false, error: folderError };
    }

    const result = await uploadFile(supabase, folderPath, file);
    if (typeof result !== "string") {
      return { success: false, error: result.error };
    }

    return { success: true, url: result };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al subir el archivo",
    };
  }
}

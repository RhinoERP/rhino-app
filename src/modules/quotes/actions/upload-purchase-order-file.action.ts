"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

type UploadInput = {
  file: File;
  orgSlug: string;
  quoteId: string;
  oldFileUrl: string | null;
};

const BUCKET = "purchase-orders";
const MAX_SIZE = 10 * 1024 * 1024;

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

  if (!file) {
    return { error: "No se proporcionó un archivo" };
  }
  if (!orgSlug) {
    return { error: "Organización no especificada" };
  }
  if (!quoteId) {
    return { error: "ID del presupuesto no especificado" };
  }
  if (file.type !== "application/pdf") {
    return { error: "Solo se permiten archivos PDF" };
  }
  if (file.size > MAX_SIZE) {
    return { error: "El archivo no puede superar los 10MB" };
  }

  const oldFileUrl = (formData.get("oldFileUrl") as string | null) ?? null;
  return { file, orgSlug, quoteId, oldFileUrl };
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

async function cleanQuoteFolder(
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
      contentType: "application/pdf",
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

export type UploadPurchaseOrderFileResult = {
  success: boolean;
  url?: string;
  error?: string;
};

export async function uploadPurchaseOrderFileAction(
  formData: FormData
): Promise<UploadPurchaseOrderFileResult> {
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

    const { file, orgSlug, quoteId, oldFileUrl } = parsed;
    const folderPath = `${orgSlug}/${quoteId}`;

    if (oldFileUrl) {
      await deleteOldFileByUrl(supabase, oldFileUrl);
    }

    const folderError = await cleanQuoteFolder(supabase, folderPath);
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

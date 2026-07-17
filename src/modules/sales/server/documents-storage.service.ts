import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "documents";

type DocumentType = "remittos" | "facturas";

type UploadDocumentParams = {
  orgSlug: string;
  saleId: string;
  type: DocumentType;
  filename: string;
  content: Buffer;
};

type UploadDocumentResult =
  | { success: true; url: string }
  | { success: false; error: string };

function sanitizeFileName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function buildFilePath(
  orgSlug: string,
  saleId: string,
  type: DocumentType,
  filename: string
): string {
  const sanitized = sanitizeFileName(filename);
  return `${orgSlug}/${saleId}/${type}/${sanitized}`;
}

async function deleteExistingFile(
  supabase: SupabaseClient,
  filePath: string
): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([filePath]);
  if (error && !error.message.includes("not found")) {
    throw new Error(`Error al eliminar archivo existente: ${error.message}`);
  }
}

export async function uploadSalesDocument(
  params: UploadDocumentParams
): Promise<UploadDocumentResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: "No autorizado" };
    }

    const { orgSlug, saleId, type, filename, content } = params;
    const filePath = buildFilePath(orgSlug, saleId, type, filename);

    await deleteExistingFile(supabase, filePath);

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, content, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      return {
        success: false,
        error: `Error al subir el documento: ${uploadError.message}`,
      };
    }

    const { data: urlData } = await supabase.storage
      .from(BUCKET)
      .getPublicUrl(filePath);

    return { success: true, url: urlData.publicUrl };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al subir el documento",
    };
  }
}

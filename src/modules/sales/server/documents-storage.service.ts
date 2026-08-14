import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "documents";

type DocumentType = "remittos" | "facturas" | "order_remittos" | "recibos";

type UploadDocumentParams = {
  orgSlug: string;
  referenceId: string;
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

function buildFilePath(params: {
  orgSlug: string;
  referenceId: string;
  type: DocumentType;
  filename: string;
}): string {
  const sanitized = sanitizeFileName(params.filename);
  return `${params.orgSlug}/${params.referenceId}/${params.type}/${sanitized}`;
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

async function uploadDocument(
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

    const { content } = params;
    const filePath = buildFilePath(params);

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

    return {
      success: true,
      url: `${urlData.publicUrl}?v=${Date.now()}`,
    };
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

export function uploadSalesDocument(params: {
  orgSlug: string;
  saleId: string;
  type: DocumentType;
  filename: string;
  content: Buffer;
}): Promise<UploadDocumentResult> {
  return uploadDocument({
    orgSlug: params.orgSlug,
    referenceId: params.saleId,
    type: params.type,
    filename: params.filename,
    content: params.content,
  });
}

export function uploadOrderDocument(params: {
  orgSlug: string;
  orderId: string;
  type: DocumentType;
  filename: string;
  content: Buffer;
}): Promise<UploadDocumentResult> {
  return uploadDocument({
    orgSlug: params.orgSlug,
    referenceId: params.orderId,
    type: params.type,
    filename: params.filename,
    content: params.content,
  });
}

export function uploadPaymentDocument(params: {
  orgSlug: string;
  paymentId: string;
  type: DocumentType;
  filename: string;
  content: Buffer;
}): Promise<UploadDocumentResult> {
  return uploadDocument({
    orgSlug: params.orgSlug,
    referenceId: params.paymentId,
    type: params.type,
    filename: params.filename,
    content: params.content,
  });
}

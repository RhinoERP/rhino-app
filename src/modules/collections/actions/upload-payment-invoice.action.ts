"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";

const BUCKET = "documents";
const MAX_SIZE = 10 * 1024 * 1024;

type UploadPaymentInvoiceResult =
  | { success: true; url: string; filename: string }
  | { success: false; error: string };

type ParsedInput =
  | { file: File; orgSlug: string; paymentId: string }
  | { error: string };

function sanitizeFileName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function parseInput(formData: FormData): ParsedInput {
  const orgSlug = formData.get("orgSlug") as string | null;
  const paymentId = formData.get("paymentId") as string | null;
  const file = formData.get("file") as File | null;

  if (!orgSlug) {
    return { error: "Organización no especificada" };
  }
  if (!paymentId) {
    return { error: "Pago no especificado" };
  }
  if (!file) {
    return { error: "No se proporcionó un archivo" };
  }
  if (file.type !== "application/pdf") {
    return { error: "Formato no válido. Solo se aceptan PDF" };
  }
  if (file.size > MAX_SIZE) {
    return { error: "El archivo no puede superar los 10MB" };
  }

  return { file, orgSlug, paymentId };
}

async function deleteOldInvoice(
  supabase: SupabaseClient,
  invoicePdfUrl: string | null
): Promise<void> {
  if (!invoicePdfUrl) {
    return;
  }

  try {
    const oldUrl = new URL(invoicePdfUrl);
    const parts = oldUrl.pathname.split("/");
    const bucketIndex = parts.indexOf(BUCKET);
    if (bucketIndex !== -1 && bucketIndex < parts.length - 1) {
      const oldPath = parts.slice(bucketIndex + 1).join("/");
      await supabase.storage.from(BUCKET).remove([oldPath]);
    }
  } catch {
    // ignore malformed old URLs
  }
}

/**
 * Server Action: attach an optional supplier invoice PDF to a payable payment.
 * - Validates PDF up to 10MB
 * - Uploads to the shared "documents" bucket under
 *   {orgSlug}/{paymentId}/facturas_proveedor/
 * - Saves invoice_pdf_url / invoice_filename on payable_payments
 */
export async function uploadPaymentInvoiceAction(
  formData: FormData
): Promise<UploadPaymentInvoiceResult> {
  const parsed = parseInput(formData);
  if ("error" in parsed) {
    return { success: false, error: parsed.error };
  }

  await ensure("collections.manage", parsed.orgSlug);

  try {
    const organization = await getOrganizationBySlug(parsed.orgSlug);
    if (!organization) {
      return { success: false, error: "Organización no encontrada" };
    }

    const supabase = await createClient();

    const { data: payment, error: selectError } = (await supabase
      .from("payable_payments" as never)
      .select("id, invoice_pdf_url")
      .eq("id", parsed.paymentId)
      .eq("organization_id", organization.id)
      .single()) as unknown as {
      data: { id: string; invoice_pdf_url: string | null } | null;
      error: { message: string } | null;
    };

    if (selectError) {
      return {
        success: false,
        error: `No se pudo consultar el pago: ${selectError.message}`,
      };
    }

    if (!payment) {
      return { success: false, error: "Pago no encontrado" };
    }

    const filePath = `${parsed.orgSlug}/${parsed.paymentId}/facturas_proveedor/${sanitizeFileName(parsed.file.name)}`;

    await deleteOldInvoice(supabase, payment.invoice_pdf_url);

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, parsed.file, {
        contentType: parsed.file.type,
        upsert: true,
      });

    if (uploadError) {
      return {
        success: false,
        error: `Error al subir la factura: ${uploadError.message}`,
      };
    }

    const { data: urlData } = await supabase.storage
      .from(BUCKET)
      .getPublicUrl(filePath);

    const { error: updateError } = await supabase
      .from("payable_payments" as never)
      .update({
        invoice_pdf_url: `${urlData.publicUrl}?v=${Date.now()}`,
        invoice_filename: parsed.file.name,
      } as never)
      .eq("id", parsed.paymentId)
      .eq("organization_id", organization.id);

    if (updateError) {
      return {
        success: false,
        error: `No se pudo guardar la factura en el pago: ${updateError.message}`,
      };
    }

    revalidatePath(`/org/${parsed.orgSlug}/cobranzas`);

    return {
      success: true,
      url: urlData.publicUrl,
      filename: parsed.file.name,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al subir la factura",
    };
  }
}

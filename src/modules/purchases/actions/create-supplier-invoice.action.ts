"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import {
  attachSupplierInvoicePdf,
  createSupplierInvoice,
  createSupplierInvoiceSchema,
  deleteSupplierInvoice,
} from "../service/supplier-invoices.service";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

function nullableValue(value: FormDataEntryValue | null): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function sanitizeFileName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_");
}

function parseInvoiceForm(formData: FormData, orgSlug: string) {
  return createSupplierInvoiceSchema.safeParse({
    orgSlug,
    supplierId: formData.get("supplierId"),
    purchaseOrderId: nullableValue(formData.get("purchaseOrderId")),
    invoiceType: formData.get("invoiceType"),
    pointOfSale: nullableValue(formData.get("pointOfSale")),
    invoiceNumber: formData.get("invoiceNumber"),
    invoiceDate: formData.get("invoiceDate"),
    dueDate: nullableValue(formData.get("dueDate")),
    subtotalAmount: formData.get("subtotalAmount"),
    taxAmount: formData.get("taxAmount"),
    totalAmount: formData.get("totalAmount"),
    notes: nullableValue(formData.get("notes")),
  });
}

function validatePdf(file: FormDataEntryValue | null): string | null {
  if (!(file instanceof File) || file.size === 0) {
    return null;
  }
  if (file.type !== "application/pdf") {
    return "El comprobante debe ser un PDF.";
  }
  if (file.size > MAX_FILE_SIZE) {
    return "El archivo no puede superar los 10 MB.";
  }
  return null;
}

async function uploadPdfIfPresent(params: {
  file: FormDataEntryValue | null;
  invoiceId: string;
  orgSlug: string;
}): Promise<void> {
  const { file, invoiceId, orgSlug } = params;
  if (!(file instanceof File) || file.size === 0) {
    return;
  }

  const supabase = await createClient();
  const filename = sanitizeFileName(file.name) || "factura.pdf";
  const path = `${orgSlug}/${invoiceId}/facturas_proveedor/${filename}`;
  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(path, file, { contentType: file.type, upsert: true });
  if (uploadError) {
    throw new Error(`No se pudo adjuntar el PDF: ${uploadError.message}`);
  }

  const { data: urlData } = supabase.storage
    .from("documents")
    .getPublicUrl(path);
  await attachSupplierInvoicePdf({
    invoiceId,
    orgSlug,
    filename,
    url: `${urlData.publicUrl}?v=${Date.now()}`,
  });
}

export async function createSupplierInvoiceAction(formData: FormData) {
  const orgSlug = nullableValue(formData.get("orgSlug"));
  if (!orgSlug) {
    return { success: false, error: "Organización no especificada" };
  }

  await ensure("purchases.manage", orgSlug);

  const parsed = parseInvoiceForm(formData, orgSlug);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Datos de factura inválidos",
    };
  }

  const file = formData.get("file");
  const fileError = validatePdf(file);
  if (fileError) {
    return { success: false, error: fileError };
  }

  let createdInvoiceId: string | null = null;
  try {
    const invoice = await createSupplierInvoice(parsed.data);
    createdInvoiceId = invoice.id;
    await uploadPdfIfPresent({ file, invoiceId: invoice.id, orgSlug });

    revalidatePath(`/org/${orgSlug}/compras/facturas-proveedor`);
    return { success: true };
  } catch (error) {
    if (createdInvoiceId) {
      await deleteSupplierInvoice({ invoiceId: createdInvoiceId, orgSlug });
    }
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo registrar la factura",
    };
  }
}

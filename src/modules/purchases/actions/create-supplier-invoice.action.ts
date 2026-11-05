"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import {
  type CreateSupplierInvoiceInput,
  createSupplierInvoice,
  createSupplierInvoiceSchema,
  SupplierInvoiceRegistrationError,
} from "../service/supplier-invoices.service";
import type { SupplierInvoice } from "../supplier-invoices.types";
import { validateSupplierInvoicePdf } from "../utils/supplier-invoice-pdf";

export type CreateSupplierInvoiceActionResult =
  | { success: true; invoice: SupplierInvoice }
  | { success: false; error: string };
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
    purchaseOrderIds: formData
      .getAll("purchaseOrderIds")
      .filter((value) => typeof value === "string" && value !== ""),
    currency: nullableValue(formData.get("currency")) ?? "ARS",
    invoiceType: formData.get("invoiceType"),
    pointOfSale: nullableValue(formData.get("pointOfSale")),
    invoiceNumber: formData.get("invoiceNumber"),
    invoiceDate: formData.get("invoiceDate"),
    dueDate: nullableValue(formData.get("dueDate")),
    subtotalAmount: formData.get("subtotalAmount"),
    taxAmount: formData.get("taxAmount"),
    totalAmount: formData.get("totalAmount"),
    exchangeRate: formData.get("exchangeRate"),
    notes: nullableValue(formData.get("notes")),
  });
}

function validatePdf(file: FormDataEntryValue | null): string | null {
  if (!(file instanceof File) || file.size === 0) {
    return null;
  }
  return validateSupplierInvoicePdf(file);
}

async function uploadPdfIfPresent(params: {
  file: FormDataEntryValue | null;
  invoiceId: string;
  orgSlug: string;
}): Promise<{
  filename: string;
  path: string;
} | null> {
  const { file, invoiceId, orgSlug } = params;
  if (!(file instanceof File) || file.size === 0) {
    return null;
  }

  const supabase = await createClient();
  const filename = sanitizeFileName(file.name) || "factura.pdf";
  const path = `${orgSlug}/${invoiceId}/facturas_proveedor/${filename}`;
  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    throw new Error(`No se pudo adjuntar el PDF: ${uploadError.message}`);
  }

  return {
    filename,
    path,
  };
}

async function removeUploadedPdf(path: string): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.storage.from("documents").remove([path]);
    if (error) {
      console.error("No se pudo eliminar el PDF de factura huérfano:", error);
    }
  } catch (error) {
    console.error("No se pudo eliminar el PDF de factura huérfano:", error);
  }
}

async function recoverInvoiceFailure(params: {
  invoiceId: string | null;
  path: string | null;
  error: unknown;
  registrationAttempted: boolean;
}): Promise<string> {
  if (params.invoiceId) {
    return `La factura ${params.invoiceId} quedó registrada. No vuelvas a cargarla; actualizá el listado para continuar.`;
  }
  const rolledBack =
    params.error instanceof SupplierInvoiceRegistrationError &&
    params.error.stagedFileCanBeRemoved;
  if (params.registrationAttempted && !rolledBack) {
    return `No se pudo confirmar el registro. Revisá el listado de facturas antes de reintentar.${params.path ? " Se conservó el PDF por si la operación se confirmó." : ""}`;
  }
  if (params.path) {
    await removeUploadedPdf(params.path);
  }
  return params.error instanceof Error
    ? params.error.message
    : "No se pudo registrar la factura";
}

function refreshInvoiceViews(
  orgSlug: string,
  input: CreateSupplierInvoiceInput
): void {
  try {
    revalidatePath(`/org/${orgSlug}/compras/facturas-proveedor`);
    revalidatePath(`/org/${orgSlug}/cobranzas`);
    revalidatePath(`/org/${orgSlug}/compras`);
    for (const id of new Set([
      ...input.purchaseOrderIds,
      ...(input.purchaseOrderId ? [input.purchaseOrderId] : []),
    ])) {
      revalidatePath(`/org/${orgSlug}/compras/${id}`);
    }
  } catch (error) {
    // Cache refresh is not part of the financial commit; keep the success result
    // so the client can finish its idempotent accounting workflow.
    console.error(
      "No se pudieron refrescar los listados de la factura registrada",
      error
    );
  }
}

export async function createSupplierInvoiceAction(
  formData: FormData
): Promise<CreateSupplierInvoiceActionResult> {
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
  let uploadedPdfPath: string | null = null;
  let registrationAttempted = false;
  try {
    // The storage folder uses a temporary UUID. Storage authorization is scoped
    // by orgSlug, not invoice identity; no debt exists when upload fails.
    const uploadedPdf = await uploadPdfIfPresent({
      file,
      invoiceId: randomUUID(),
      orgSlug,
    });
    uploadedPdfPath = uploadedPdf?.path ?? null;
    registrationAttempted = true;
    const invoice = await createSupplierInvoice(
      parsed.data,
      uploadedPdf ?? undefined
    );
    createdInvoiceId = invoice.id;

    refreshInvoiceViews(orgSlug, parsed.data);
    return { success: true, invoice };
  } catch (error) {
    const recoveryError = await recoverInvoiceFailure({
      invoiceId: createdInvoiceId,
      path: uploadedPdfPath,
      error,
      registrationAttempted,
    });
    return {
      success: false,
      error: recoveryError,
    };
  }
}

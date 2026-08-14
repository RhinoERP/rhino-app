"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { uploadPaymentDocument } from "@/modules/sales/server/documents-storage.service";
import {
  claimReceiptNumber,
  renderReceiptPdfDocument,
} from "../server/receipt-pdf-document.service";

type GenerateReceiptResult =
  | {
      success: true;
      html: string;
      receiptNumber: string;
      pdfUrl: string | null;
    }
  | { success: false; error: string };

/**
 * Server Action: generate receipt PDF for a customer payment
 * - Claims the next receipt number for the organization
 * - Renders the PDF with Puppeteer
 * - Uploads it to Supabase Storage
 * - Saves receipt_number / receipt_pdf_url on receivable_payments
 */
export async function generateReceiptAction(
  orgSlug: string,
  paymentId: string
): Promise<GenerateReceiptResult> {
  await ensure(["collections.read", "collections.manage"], orgSlug);

  try {
    const organization = await getOrganizationBySlug(orgSlug);
    if (!organization) {
      return { success: false, error: "Organización no encontrada" };
    }

    const supabase = await createClient();

    const { data: existing } = await supabase
      .from("receivable_payments")
      .select("receipt_number, receipt_pdf_url")
      .eq("id", paymentId)
      .eq("organization_id", organization.id)
      .single();

    if (existing?.receipt_number && existing.receipt_pdf_url) {
      return {
        success: true,
        html: "",
        receiptNumber: existing.receipt_number,
        pdfUrl: existing.receipt_pdf_url,
      };
    }

    const receiptNumber = await claimReceiptNumber(organization.id);

    const pdfDoc = await renderReceiptPdfDocument({
      orgId: organization.id,
      paymentId,
      receiptNumber,
    });

    let pdfUrl: string | null = null;
    const uploadResult = await uploadPaymentDocument({
      orgSlug,
      paymentId,
      type: "recibos",
      filename: pdfDoc.filename,
      content: pdfDoc.content,
    });

    if (uploadResult.success) {
      pdfUrl = uploadResult.url;
    }

    const { error: updateError } = await supabase
      .from("receivable_payments")
      .update({
        receipt_number: receiptNumber,
        receipt_pdf_url: pdfUrl,
      })
      .eq("id", paymentId)
      .eq("organization_id", organization.id);

    if (updateError) {
      throw new Error(
        `No se pudo guardar el recibo en el pago: ${updateError.message}`
      );
    }

    revalidatePath(`/org/${orgSlug}/cobranzas`);

    return {
      success: true,
      html: pdfDoc.html,
      receiptNumber,
      pdfUrl,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Error al generar el recibo",
    };
  }
}

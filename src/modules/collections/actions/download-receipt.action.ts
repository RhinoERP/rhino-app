"use server";

import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { uploadPaymentDocument } from "@/modules/sales/server/documents-storage.service";
import {
  claimReceiptNumber,
  renderReceiptPdfDocument,
} from "../server/receipt-pdf-document.service";

type DownloadReceiptResult =
  | { success: true; filename: string; pdfBase64: string }
  | { success: false; error: string };

/**
 * Server Action: download receipt PDF for a customer payment.
 * - If receipt_pdf_url exists, downloads from storage
 * - Otherwise generates the PDF, uploads it and saves the URL
 */
export async function downloadReceiptAction(
  orgSlug: string,
  paymentId: string
): Promise<DownloadReceiptResult> {
  await ensure(["collections.read", "collections.manage"], orgSlug);

  try {
    const organization = await getOrganizationBySlug(orgSlug);
    if (!organization) {
      return { success: false, error: "Organización no encontrada" };
    }

    const supabase = await createClient();

    const { data: payment } = await supabase
      .from("receivable_payments")
      .select("receipt_number, receipt_pdf_url")
      .eq("id", paymentId)
      .eq("organization_id", organization.id)
      .single();

    if (payment?.receipt_pdf_url) {
      const response = await fetch(payment.receipt_pdf_url);
      if (!response.ok) {
        throw new Error("No se pudo descargar el PDF desde el almacenamiento");
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const sanitizedNumber = (payment.receipt_number ?? "sin-numero").replace(
        /[^0-9]/g,
        ""
      );

      return {
        success: true,
        filename: `Recibo_${sanitizedNumber || "sin-numero"}.pdf`,
        pdfBase64: buffer.toString("base64"),
      };
    }

    const receiptNumber = await claimReceiptNumber(organization.id);
    const pdfDoc = await renderReceiptPdfDocument({
      orgId: organization.id,
      paymentId,
      receiptNumber,
    });

    const uploadResult = await uploadPaymentDocument({
      orgSlug,
      paymentId,
      type: "recibos",
      filename: pdfDoc.filename,
      content: pdfDoc.content,
    });

    if (uploadResult.success) {
      await supabase
        .from("receivable_payments")
        .update({
          receipt_number: receiptNumber,
          receipt_pdf_url: uploadResult.url,
        })
        .eq("id", paymentId)
        .eq("organization_id", organization.id);
    }

    return {
      success: true,
      filename: pdfDoc.filename,
      pdfBase64: pdfDoc.content.toString("base64"),
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Error al descargar el recibo",
    };
  }
}

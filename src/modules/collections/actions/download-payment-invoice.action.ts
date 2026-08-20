"use server";

import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";

type DownloadPaymentInvoiceResult =
  | { success: true; filename: string; pdfBase64: string }
  | { success: false; error: string };

/**
 * Server Action: download the supplier invoice PDF attached to a payable payment.
 */
export async function downloadPaymentInvoiceAction(
  orgSlug: string,
  paymentId: string
): Promise<DownloadPaymentInvoiceResult> {
  await ensure(["collections.read", "collections.manage"], orgSlug);

  try {
    const organization = await getOrganizationBySlug(orgSlug);
    if (!organization) {
      return { success: false, error: "Organización no encontrada" };
    }

    const supabase = await createClient();

    const { data: payment } = (await supabase
      .from("payable_payments" as never)
      .select("invoice_pdf_url, invoice_filename")
      .eq("id", paymentId)
      .eq("organization_id", organization.id)
      .single()) as unknown as {
      data: {
        invoice_pdf_url: string | null;
        invoice_filename: string | null;
      } | null;
      error: { message: string } | null;
    };

    if (!payment?.invoice_pdf_url) {
      return { success: false, error: "Este pago no tiene factura cargada" };
    }

    const response = await fetch(payment.invoice_pdf_url);
    if (!response.ok) {
      throw new Error(
        "No se pudo descargar la factura desde el almacenamiento"
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const filename =
      payment.invoice_filename ?? `Factura_${paymentId.slice(0, 8)}.pdf`;

    return {
      success: true,
      filename,
      pdfBase64: buffer.toString("base64"),
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error al descargar la factura",
    };
  }
}

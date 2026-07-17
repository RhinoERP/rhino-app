"use server";

import { createClient } from "@/lib/supabase/server";
import { uploadSalesDocument } from "../server/documents-storage.service";
import { generateRemittancePdfDocument } from "../server/remittance-pdf-document.service";

type GenerateRemittanceResult = {
  success: boolean;
  html?: string;
  saleNumber?: number | null;
  pdfUrl?: string | null;
  error?: string;
};

/**
 * Server Action: Generate remittance HTML + PDF for a sale
 * - Generates HTML for preview
 * - Generates PDF with Puppeteer
 * - Uploads PDF to Supabase Storage
 * - Saves URL in sales_orders.remittance_pdf_url
 */
export async function generateRemittanceAction(
  orgSlug: string,
  saleId: string,
  type: "PRESUPUESTO" | "REMITO_FINAL"
): Promise<GenerateRemittanceResult> {
  try {
    const pdfDoc = await generateRemittancePdfDocument({
      orgSlug,
      saleId,
      type,
    });

    // Upload PDF to storage and save URL (best-effort; preview still works)
    let pdfUrl: string | null = null;
    try {
      const uploadResult = await uploadSalesDocument({
        orgSlug,
        saleId,
        type: "remittos",
        filename: pdfDoc.filename,
        content: pdfDoc.content,
      });

      if (uploadResult.success) {
        pdfUrl = uploadResult.url;

        const supabase = await createClient();
        await supabase
          .from("sales_orders")
          .update({ remittance_pdf_url: pdfUrl } as never)
          .eq("id", saleId);
      }
    } catch {
      // PDF upload is best-effort; HTML preview still works
    }

    return {
      success: true,
      html: pdfDoc.html,
      saleNumber: pdfDoc.saleNumber,
      pdfUrl,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Error al generar el remito",
    };
  }
}

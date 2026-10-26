"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { uploadSalesDocument } from "../server/documents-storage.service";
import { generateRemittancePdfDocument } from "../server/remittance-pdf-document.service";

type GenerateRemittanceResult = {
  success: boolean;
  html?: string;
  saleNumber?: number | null;
  pdfUrl?: string | null;
  fallbackPdf?: { filename: string; pdfBase64: string };
  storageError?: string;
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
  await ensure("sales.manage", orgSlug);
  try {
    const pdfDoc = await generateRemittancePdfDocument({
      orgSlug,
      saleId,
      type,
    });

    // Keep the rendered PDF available for download when Storage or persistence fails.
    let pdfUrl: string | null = null;
    let storageError: string | undefined;
    try {
      const uploadResult = await uploadSalesDocument({
        orgSlug,
        saleId,
        type: "remittos",
        filename: pdfDoc.filename,
        content: pdfDoc.content,
      });

      if (uploadResult.success) {
        const supabase = await createClient();
        const { data: savedSale, error: saveError } = await supabase
          .from("sales_orders")
          .update({ remittance_pdf_url: uploadResult.url } as never)
          .eq("id", saleId)
          .select("id")
          .maybeSingle();
        if (saveError || !savedSale) {
          storageError = `El PDF se subió, pero no se pudo guardar en la venta: ${saveError?.message ?? "venta no actualizada"}`;
        } else {
          pdfUrl = uploadResult.url;
          revalidatePath(`/org/${orgSlug}/ventas/${saleId}`);
        }
      } else {
        storageError = uploadResult.error;
      }
    } catch (error) {
      storageError =
        error instanceof Error ? error.message : "Error al guardar el PDF";
    }

    return {
      success: true,
      html: pdfDoc.html,
      saleNumber: pdfDoc.saleNumber,
      pdfUrl,
      ...(storageError
        ? {
            storageError,
            fallbackPdf: {
              filename: pdfDoc.filename,
              pdfBase64: pdfDoc.content.toString("base64"),
            },
          }
        : {}),
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Error al generar el remito",
    };
  }
}

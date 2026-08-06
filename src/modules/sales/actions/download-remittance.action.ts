"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { uploadSalesDocument } from "../server/documents-storage.service";
import { generateRemittancePdfDocument } from "../server/remittance-pdf-document.service";

type DownloadRemittanceResult =
  | {
      success: true;
      filename: string;
      pdfBase64: string;
    }
  | {
      success: false;
      error: string;
    };

/**
 * Server Action: Download remittance PDF
 * - If remittance_pdf_url exists, download from storage
 * - Otherwise, generate PDF with Puppeteer, upload, and save URL
 */
export async function downloadRemittanceAction(
  orgSlug: string,
  saleId: string,
  type: "PRESUPUESTO" | "REMITO_FINAL"
): Promise<DownloadRemittanceResult> {
  await ensure("sales.manage", orgSlug);
  try {
    const supabase = await createClient();

    // Check if PDF URL exists
    const { data: sale } = await supabase
      .from("sales_orders")
      .select("remittance_pdf_url, sale_number")
      .eq("id", saleId)
      .single();

    const saleData = sale as {
      remittance_pdf_url?: string | null;
      sale_number?: number | null;
    } | null;

    if (saleData?.remittance_pdf_url) {
      // Download from storage
      const response = await fetch(saleData.remittance_pdf_url);
      if (!response.ok) {
        throw new Error("No se pudo descargar el PDF desde el almacenamiento");
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const saleNumber = saleData.sale_number ?? "sin-numero";
      const filename =
        type === "PRESUPUESTO"
          ? `Presupuesto_${saleNumber}.pdf`
          : `Remito_${saleNumber}.pdf`;

      return {
        success: true,
        filename,
        pdfBase64: buffer.toString("base64"),
      };
    }

    // Generate PDF and upload
    const pdfDoc = await generateRemittancePdfDocument({
      orgSlug,
      saleId,
      type,
    });

    const uploadResult = await uploadSalesDocument({
      orgSlug,
      saleId,
      type: "remittos",
      filename: pdfDoc.filename,
      content: pdfDoc.content,
    });

    if (uploadResult.success) {
      // Save URL in database (best-effort)
      await supabase
        .from("sales_orders")
        .update({ remittance_pdf_url: uploadResult.url } as never)
        .eq("id", saleId);

      revalidatePath(`/org/${orgSlug}/ventas/${saleId}`);
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
        error instanceof Error ? error.message : "Error al descargar el remito",
    };
  }
}

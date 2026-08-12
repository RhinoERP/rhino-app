"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { uploadOrderDocument } from "@/modules/sales/server/documents-storage.service";
import { generateOrderRemittancePdfDocument } from "../server/order-remittance-pdf-document.service";

type DownloadOrderRemittanceResult =
  | {
      success: true;
      filename: string;
      pdfBase64: string;
      pdfUrl?: string | null;
    }
  | {
      success: false;
      error: string;
    };

export async function downloadOrderRemittanceAction(
  orgSlug: string,
  childOrderId: string,
  remitoNumber: string
): Promise<DownloadOrderRemittanceResult> {
  await ensure("orders.manage", orgSlug);
  try {
    const supabase = await createClient();

    // Always re-render before downloading so previously stored remittances do
    // not keep an outdated layout or stale sale data.
    const pdfDoc = await generateOrderRemittancePdfDocument({
      orgSlug,
      childOrderId,
      remitoNumber,
    });

    const uploadResult = await uploadOrderDocument({
      orgSlug,
      orderId: childOrderId,
      type: "order_remittos",
      filename: pdfDoc.filename,
      content: pdfDoc.content,
    });

    if (uploadResult.success) {
      await supabase
        .from("order_dispatch_events")
        .update({ remittance_pdf_url: uploadResult.url })
        .eq("order_id", childOrderId)
        .eq("remito_number", remitoNumber);

      revalidatePath(`/org/${orgSlug}/pedidos/${childOrderId}`);
    }

    return {
      success: true,
      filename: pdfDoc.filename,
      pdfBase64: pdfDoc.content.toString("base64"),
      pdfUrl: uploadResult.success ? uploadResult.url : undefined,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Error al descargar el remito",
    };
  }
}

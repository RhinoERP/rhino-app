"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { uploadOrderDocument } from "@/modules/sales/server/documents-storage.service";
import {
  findSavedRemittance,
  persistSavedRemittancePdf,
} from "../server/order-remittance-documents.service";
import {
  generateOrderRemittancePdfDocument,
  resolveRemittanceOrderIds,
} from "../server/order-remittance-pdf-document.service";

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

async function ensureDownloadAccess(
  orgSlug: string,
  orderId: string,
  remitoNumber: string
) {
  await ensure(READ_PERMISSIONS.orders, orgSlug);
  // Documentary reads use their RLS scope. Keep the existing mutation-capable
  // permission on the historical renderer rather than widening that path.
  const saved = await findSavedRemittance(orgSlug, [orderId], remitoNumber);
  if (!saved) {
    await ensure("orders.manage", orgSlug);
  }
}

export async function downloadOrderRemittanceAction(
  orgSlug: string,
  childOrderId: string,
  remitoNumber: string
): Promise<DownloadOrderRemittanceResult> {
  await ensureDownloadAccess(orgSlug, childOrderId, remitoNumber);
  try {
    const supabase = await createClient();

    // Documentary content comes from the immutable snapshot; legacy content
    // retains the historical renderer. Neither path allocates a new number.
    const childOrderIds = await resolveRemittanceOrderIds(
      childOrderId,
      remitoNumber,
      orgSlug
    );

    const pdfDoc = await generateOrderRemittancePdfDocument({
      orgSlug,
      childOrderIds,
      remitoNumber,
    });

    const uploadResult = await uploadOrderDocument({
      orgSlug,
      orderId: pdfDoc.documentId ?? childOrderIds[0],
      type: "order_remittos",
      filename: pdfDoc.filename,
      content: pdfDoc.content,
    });

    if (uploadResult.success) {
      if (pdfDoc.documentId) {
        await persistSavedRemittancePdf(
          orgSlug,
          pdfDoc.documentId,
          uploadResult.url
        );
      } else {
        await supabase
          .from("order_dispatch_events")
          .update({ remittance_pdf_url: uploadResult.url })
          .in("order_id", childOrderIds)
          .eq("remito_number", remitoNumber);
      }

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

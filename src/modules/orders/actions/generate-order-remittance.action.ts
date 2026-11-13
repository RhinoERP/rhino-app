"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { generateRemittanceNumber } from "@/modules/organizations/actions/generate-remittance-number.action";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { uploadOrderDocument } from "@/modules/sales/server/documents-storage.service";
import { findSavedRemittance } from "../server/order-remittance-documents.service";
import { assertNoIssuedOrderRemittancesBySlug } from "../server/order-remittance-guards.service";
import {
  generateOrderRemittancePdfDocument,
  resolveRemittanceOrderIds,
} from "../server/order-remittance-pdf-document.service";
import { downloadOrderRemittanceAction } from "./download-order-remittance.action";

type GenerateOrderRemittanceResult = {
  success: boolean;
  pdfUrl?: string | null;
  error?: string;
};

export async function generateOrderRemittanceAction(
  orgSlug: string,
  orderId: string,
  remitoNumber?: string
): Promise<GenerateOrderRemittanceResult> {
  await ensure("orders.manage", orgSlug);
  try {
    const supabase = await createClient();

    const saved = remitoNumber
      ? await findSavedRemittance(orgSlug, [orderId], remitoNumber)
      : null;
    if (saved) {
      const result = await downloadOrderRemittanceAction(
        orgSlug,
        orderId,
        remitoNumber ?? saved.document_number
      );
      return result.success ? { success: true, pdfUrl: result.pdfUrl } : result;
    }
    await assertNoIssuedOrderRemittancesBySlug(supabase, orgSlug, orderId);

    const resolvedRemito =
      remitoNumber ??
      (await generateRemittanceNumber(orgSlug).then((r) => {
        if (!(r.success && r.number)) {
          throw new Error("No se pudo generar el número de remito");
        }
        return r.number;
      }));

    if (!resolvedRemito) {
      throw new Error("No se pudo generar el número de remito");
    }

    const { data: existingEvent } = await supabase
      .from("order_dispatch_events")
      .select("id")
      .eq("order_id", orderId)
      .eq("remito_number", resolvedRemito)
      .maybeSingle();

    if (!existingEvent) {
      const { error: insertError } = await supabase
        .from("order_dispatch_events")
        .insert({
          order_id: orderId,
          remito_number: resolvedRemito,
          dispatched_at: new Date().toISOString(),
        });
      if (insertError) {
        throw new Error("Error al crear evento de despacho");
      }
    }

    const childOrderIds = await resolveRemittanceOrderIds(
      orderId,
      resolvedRemito,
      orgSlug
    );

    const pdfDoc = await generateOrderRemittancePdfDocument({
      orgSlug,
      childOrderIds,
      remitoNumber: resolvedRemito,
    });

    let pdfUrl: string | null = null;
    try {
      const uploadResult = await uploadOrderDocument({
        orgSlug,
        orderId: childOrderIds[0],
        type: "order_remittos",
        filename: pdfDoc.filename,
        content: pdfDoc.content,
      });

      if (uploadResult.success) {
        pdfUrl = uploadResult.url;

        await supabase
          .from("order_dispatch_events")
          .update({ remittance_pdf_url: pdfUrl })
          .in("order_id", childOrderIds)
          .eq("remito_number", resolvedRemito);

        revalidatePath(`/org/${orgSlug}/pedidos/${orderId}`);
      }
    } catch (e) {
      console.error("Failed to upload remittance PDF:", e);
    }

    return { success: true, pdfUrl };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Error al generar el remito",
    };
  }
}

import "server-only";

import type { createClient } from "@/lib/supabase/server";
import { uploadOrderDocument } from "@/modules/sales/server/documents-storage.service";
import { generateOrderRemittancePdfDocument } from "./order-remittance-pdf-document.service";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Regenerates the remittance PDFs of every dispatched child order of a sale so
 * they reflect the current sale data. Files are overwritten in-place (same
 * storage path), so URLs stay valid and no orphan files are left behind.
 *
 * Best-effort per event: a failure nulls the event URL (falling back to the
 * manual "Generar remito" flow) and never fails the caller.
 */
export async function regenerateChildOrderRemitos(params: {
  supabase: SupabaseServerClient;
  orgSlug: string;
  saleId: string;
}): Promise<void> {
  const { supabase, orgSlug, saleId } = params;

  const { data: parentOrder } = await supabase
    .from("orders")
    .select("id")
    .eq("sales_order_id", saleId)
    .maybeSingle();

  if (!parentOrder) {
    return;
  }

  const { data: children } = await supabase
    .from("orders")
    .select("id")
    .eq("parent_order_id", parentOrder.id);

  const childIds = (children ?? []).map((child) => child.id);
  if (childIds.length === 0) {
    return;
  }

  const { data: events } = await supabase
    .from("order_dispatch_events")
    .select("id, order_id, remito_number")
    .in("order_id", childIds);

  for (const event of events ?? []) {
    try {
      const pdfDoc = await generateOrderRemittancePdfDocument({
        orgSlug,
        childOrderId: event.order_id,
        remitoNumber: event.remito_number,
      });

      const uploadResult = await uploadOrderDocument({
        orgSlug,
        orderId: event.order_id,
        type: "order_remittos",
        filename: pdfDoc.filename,
        content: pdfDoc.content,
      });

      if (uploadResult.success) {
        await supabase
          .from("order_dispatch_events")
          .update({ remittance_pdf_url: uploadResult.url })
          .eq("id", event.id);
      } else {
        console.error(
          `No se pudo regenerar el remito del pedido ${event.order_id}: ${uploadResult.error}`
        );
        await supabase
          .from("order_dispatch_events")
          .update({ remittance_pdf_url: null })
          .eq("id", event.id);
      }
    } catch (error) {
      console.error(
        `No se pudo regenerar el remito del pedido ${event.order_id}`,
        error
      );
      await supabase
        .from("order_dispatch_events")
        .update({ remittance_pdf_url: null })
        .eq("id", event.id);
    }
  }
}

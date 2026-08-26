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
  orgId: string;
  saleId: string;
}): Promise<void> {
  const { supabase, orgSlug, orgId, saleId } = params;

  const { data: parentOrder } = await supabase
    .from("orders")
    .select("id")
    .eq("sales_order_id", saleId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!parentOrder) {
    return;
  }

  const { data: children } = await supabase
    .from("orders")
    .select("id")
    .eq("parent_order_id", parentOrder.id)
    .eq("organization_id", orgId);

  const childIds = (children ?? []).map((child) => child.id);
  if (childIds.length === 0) {
    return;
  }

  const { data: events } = await supabase
    .from("order_dispatch_events")
    .select("id, order_id, remito_number, dispatch_group_id")
    .in("order_id", childIds);

  type EventRow = {
    id: string;
    order_id: string;
    remito_number: string;
    dispatch_group_id: string | null;
  };

  const groups = new Map<string, EventRow[]>();
  for (const event of (events ?? []) as EventRow[]) {
    const key = event.dispatch_group_id ?? event.id;
    const group = groups.get(key) ?? [];
    group.push(event);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    const orderIds = group.map((event) => event.order_id);
    const remitoNumber = group[0].remito_number;
    const eventIds = group.map((event) => event.id);

    try {
      const pdfDoc = await generateOrderRemittancePdfDocument({
        orgSlug,
        childOrderIds: orderIds,
        remitoNumber,
      });

      const uploadResult = await uploadOrderDocument({
        orgSlug,
        orderId: orderIds[0],
        type: "order_remittos",
        filename: pdfDoc.filename,
        content: pdfDoc.content,
      });

      if (uploadResult.success) {
        await supabase
          .from("order_dispatch_events")
          .update({ remittance_pdf_url: uploadResult.url })
          .in("id", eventIds);
      } else {
        console.error(
          `No se pudo regenerar el remito ${remitoNumber}: ${uploadResult.error}`
        );
        await supabase
          .from("order_dispatch_events")
          .update({ remittance_pdf_url: null })
          .in("id", eventIds);
      }
    } catch (error) {
      console.error(`No se pudo regenerar el remito ${remitoNumber}`, error);
      await supabase
        .from("order_dispatch_events")
        .update({ remittance_pdf_url: null })
        .in("id", eventIds);
    }
  }
}

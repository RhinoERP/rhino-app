"use server";

import { createClient } from "@/lib/supabase/server";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";

export type OrderDispatchEventSummary = {
  child_order_id: string;
  child_order_number: string;
  remito_number: string;
  dispatched_at: string;
  remittance_pdf_url: string | null;
};

export async function getOrderDispatchEventsAction(
  orgSlug: string,
  orderIds: string[]
): Promise<OrderDispatchEventSummary[]> {
  await ensure("orders.read", orgSlug);
  if (orderIds.length === 0) {
    return [];
  }
  const supabase = await createClient();

  const { data: events } = await (supabase
    .from("order_dispatch_events")
    .select(
      `
      remito_number,
      dispatched_at,
      remittance_pdf_url,
      order_id,
      orders!inner(order_number)
    `
    )
    .in("order_id", orderIds) as unknown as Promise<{
    data: Record<string, unknown>[] | null;
  }>);

  if (!events) {
    return [];
  }

  return events.map((e) => {
    const raw = e as {
      remito_number: string;
      dispatched_at: string;
      remittance_pdf_url: string | null;
      order_id: string;
      orders: { order_number: string };
    };

    return {
      child_order_id: raw.order_id,
      child_order_number: raw.orders.order_number,
      remito_number: raw.remito_number,
      dispatched_at: raw.dispatched_at,
      remittance_pdf_url: raw.remittance_pdf_url,
    };
  });
}

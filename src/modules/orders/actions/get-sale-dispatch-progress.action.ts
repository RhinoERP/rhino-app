"use server";

import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import type { SaleDispatchEvent, SaleDispatchProgress } from "../types";

export async function getSaleDispatchProgressAction(
  orgSlug: string,
  saleId: string
): Promise<SaleDispatchProgress | null> {
  await ensure("orders.read", orgSlug);
  const supabase = await createClient();
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    return null;
  }

  const { data: parentOrder } = await supabase
    .from("orders")
    .select("id")
    .eq("sales_order_id", saleId)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (!parentOrder) {
    return null;
  }

  const { data: children, error: childrenError } = await supabase
    .from("orders")
    .select("id, order_number, status")
    .eq("parent_order_id", parentOrder.id)
    .eq("organization_id", org.id);

  if (childrenError || !children || children.length === 0) {
    return null;
  }

  const childIds = children.map((c) => c.id);

  const [eventsResult, itemsResult] = await Promise.all([
    supabase
      .from("order_dispatch_events")
      .select(
        `
        remito_number,
        dispatched_at,
        notes,
        order_id,
        remittance_pdf_url,
        orders!inner(order_number)
      `
      )
      .in("order_id", childIds),
    supabase
      .from("quote_items")
      .select("id, description, quantity, assigned_order_id")
      .in("assigned_order_id", childIds),
  ]);

  const dispatchEvents = eventsResult.data ?? [];
  const items = itemsResult.data ?? [];

  const itemsByChild = new Map<
    string,
    Array<{ id: string; description: string; quantity: number }>
  >();
  for (const item of items) {
    if (!item.assigned_order_id) {
      continue;
    }
    const group = itemsByChild.get(item.assigned_order_id) ?? [];
    group.push({
      id: item.id,
      description: item.description ?? "",
      quantity: item.quantity,
    });
    itemsByChild.set(item.assigned_order_id, group);
  }

  const activeChildren = children.filter((c) => c.status !== "CANCELLED");

  if (activeChildren.length === 0) {
    return null;
  }

  const dispatchedChildIds = new Set(
    activeChildren
      .filter((c) => c.status === "DISPATCHED" || c.status === "DELIVERED")
      .map((c) => c.id)
  );
  const deliveredChildren = activeChildren.filter(
    (c) => c.status === "DELIVERED"
  ).length;

  const completed = activeChildren.every((c) => c.status === "DELIVERED");

  const events: SaleDispatchEvent[] = dispatchEvents.map((e) => {
    const raw = e as unknown as {
      remito_number: string;
      dispatched_at: string;
      notes: string | null;
      order_id: string;
      remittance_pdf_url: string | null;
      orders: { order_number: string };
    };

    return {
      remito_number: raw.remito_number,
      dispatched_at: raw.dispatched_at,
      child_order_number: raw.orders.order_number,
      child_order_id: raw.order_id,
      notes: raw.notes,
      items: itemsByChild.get(raw.order_id) ?? [],
      remittance_pdf_url: raw.remittance_pdf_url,
    };
  });

  return {
    total_children: activeChildren.length,
    dispatched_children: dispatchedChildIds.size,
    delivered_children: deliveredChildren,
    completed,
    events,
  };
}

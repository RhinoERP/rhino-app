"use server";

import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import type { SaleDispatchEvent, SaleDispatchProgress } from "../types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type DispatchItemRow = {
  id: string;
  description: string;
  quantity: number;
};

async function buildItemsByChild(
  supabase: SupabaseServerClient,
  params: {
    childIds: string[];
    standaloneOrderId?: string;
    standaloneQuoteId?: string | null;
  }
): Promise<Map<string, DispatchItemRow[]>> {
  const map = new Map<string, DispatchItemRow[]>();

  const { data: items } = await supabase
    .from("quote_items")
    .select("id, description, quantity, assigned_order_id")
    .in("assigned_order_id", params.childIds);

  for (const item of items ?? []) {
    if (!item.assigned_order_id) {
      continue;
    }
    const group = map.get(item.assigned_order_id) ?? [];
    group.push({
      id: item.id,
      description: item.description ?? "",
      quantity: item.quantity,
    });
    map.set(item.assigned_order_id, group);
  }

  // Los pedidos standalone nunca asignan sus ítems: cargarlos desde el
  // presupuesto para mostrarlos junto al remito de despacho.
  if (params.standaloneOrderId && params.standaloneQuoteId) {
    const { data: unassignedItems } = await supabase
      .from("quote_items")
      .select("id, description, quantity")
      .eq("quote_id", params.standaloneQuoteId)
      .is("assigned_order_id", null);

    const group = map.get(params.standaloneOrderId) ?? [];
    for (const item of unassignedItems ?? []) {
      group.push({
        id: item.id,
        description: item.description ?? "",
        quantity: item.quantity,
      });
    }
    map.set(params.standaloneOrderId, group);
  }

  return map;
}

export async function getSaleDispatchProgressAction(
  orgSlug: string,
  saleId: string
): Promise<SaleDispatchProgress | null> {
  await ensure(READ_PERMISSIONS.orders, orgSlug);
  const supabase = await createClient();
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    return null;
  }

  const { data: parentOrder } = await supabase
    .from("orders")
    .select("id, order_number, status, quote_id")
    .eq("sales_order_id", saleId)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (!parentOrder) {
    return null;
  }

  const { data: childrenResult, error: childrenError } = await supabase
    .from("orders")
    .select("id, order_number, status")
    .eq("parent_order_id", parentOrder.id)
    .eq("organization_id", org.id);

  if (childrenError) {
    return null;
  }

  // Los pedidos sin hijos (standalone) se despachan a sí mismos: tratarlos como
  // único sub-pedido para exponer su remito de despacho en la venta.
  const childRows = childrenResult ?? [];
  const standalone = childRows.length === 0;
  const children = standalone
    ? [
        {
          id: parentOrder.id,
          order_number: parentOrder.order_number,
          status: parentOrder.status,
        },
      ]
    : childRows;

  const childIds = children.map((c) => c.id);

  const [{ data: eventsData }, itemsByChild] = await Promise.all([
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
    buildItemsByChild(supabase, {
      childIds,
      standaloneOrderId: standalone ? parentOrder.id : undefined,
      standaloneQuoteId: standalone ? parentOrder.quote_id : undefined,
    }),
  ]);

  const dispatchEvents = eventsData ?? [];

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
    standalone,
    events,
  };
}

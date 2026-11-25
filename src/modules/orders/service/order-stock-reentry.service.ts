import type { SupabaseServerClient } from "@/lib/supabase/server";
import { applyStockReentries } from "@/modules/inventory/service/stock-reentry.service";
import type { StockReentryEntry } from "@/modules/inventory/utils/stock-reentry";

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: validates original order/lot ownership and remaining measured quantities before one atomic batch.
export async function restoreOriginalOrderStock(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  quoteItemIds: string[];
  reason: string;
  allowDefaultFallback?: boolean;
}): Promise<void> {
  if (!params.quoteItemIds.length) {
    return;
  }
  const { supabase, orgId } = params;
  const { data: items, error } = await supabase
    .from("quote_items")
    .select(
      "id, quote_id, assigned_order_id, product_id, product_variant_id, quantity"
    )
    .in("id", [...new Set(params.quoteItemIds)]);
  if (error || items?.length !== new Set(params.quoteItemIds).size) {
    throw new Error("No se pudieron identificar los ítems a reingresar");
  }
  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("id, parent_order_id, quote_id, sales_order_id, order_number")
    .eq("organization_id", orgId)
    .in("quote_id", [...new Set(items.map((item) => item.quote_id))]);
  if (ordersError || !orders) {
    throw new Error("No se pudo resolver el origen del pedido");
  }
  const entries: StockReentryEntry[] = [];
  const sourceOrderId = (item: (typeof items)[number]) =>
    item.assigned_order_id ??
    orders.find(
      (order) => order.quote_id === item.quote_id && !order.parent_order_id
    )?.id;
  const groupIds = new Set(items.map(sourceOrderId));
  for (const orderId of groupIds) {
    const order = orders.find((row) => row.id === orderId);
    if (!order) {
      throw new Error("El pedido no pertenece a la organización");
    }
    const orderItems = items.filter((item) => sourceOrderId(item) === orderId);
    let outgoingQuery = supabase
      .from("stock_movements")
      .select("id, lot_id, quantity, unit_quantity, created_at")
      .eq("organization_id", orgId)
      .eq("type", "OUTBOUND");
    if (order.parent_order_id) {
      outgoingQuery = outgoingQuery.like(
        "reason",
        `Pedido ${order.order_number} - %`
      );
    } else {
      if (!order.sales_order_id) {
        continue;
      }
      const { data: sale, error: saleError } = await supabase
        .from("sales_orders")
        .select("sale_number, invoice_number")
        .eq("organization_id", orgId)
        .eq("id", order.sales_order_id)
        .single();
      if (saleError || !sale) {
        throw new Error(
          "No se pudo consultar la salida de la venta del pedido"
        );
      }
      const prefix =
        sale.sale_number != null
          ? `Venta N${sale.sale_number}`
          : `Venta ${sale.invoice_number ?? order.sales_order_id}`;
      outgoingQuery = outgoingQuery.or(
        `reason.eq.${prefix},reason.ilike.${prefix} %,reason.eq.Venta confirmada ${order.sales_order_id}`
      );
    }
    const { data: outgoing, error: outgoingError } = await outgoingQuery
      .order("created_at", { ascending: true })
      .order("id");
    if (outgoingError) {
      throw new Error(
        "No se pudieron reconstruir los lotes originales del pedido"
      );
    }
    if (!outgoing.length) {
      continue;
    }
    const epoch = outgoing.at(-1)?.id;
    if (!epoch) {
      throw new Error("No se pudo identificar la salida original");
    }
    const prefix = `order-reentry:${order.id}:`;
    const { data: prior, error: priorError } = await supabase
      .from("stock_movements")
      .select("reentry_key, reentry_source_lot_id, quantity, unit_quantity")
      .eq("organization_id", orgId)
      .eq("type", "INBOUND")
      .like("reentry_key", `${prefix}%`)
      .is("reentry_reversed_at", null);
    if (priorError) {
      throw new Error(
        "No se pudo consultar el stock ya reingresado del pedido"
      );
    }
    const { data: lots, error: lotError } = await supabase
      .from("product_lots")
      .select("id, product_id, product_variant_id")
      .eq("organization_id", orgId)
      .in("id", [...new Set(outgoing.map((movement) => movement.lot_id))]);
    if (lotError || !lots) {
      throw new Error("No se pudieron consultar los lotes originales");
    }
    const balances = new Map<
      string,
      { quantity: number; units: number | null }
    >();
    for (const movement of outgoing) {
      const balance = balances.get(movement.lot_id) ?? {
        quantity: 0,
        units: null,
      };
      balance.quantity += movement.quantity;
      if (movement.unit_quantity != null) {
        balance.units = (balance.units ?? 0) + Math.abs(movement.unit_quantity);
      }
      balances.set(movement.lot_id, balance);
    }
    for (const movement of prior ?? []) {
      const balance = movement.reentry_source_lot_id
        ? balances.get(movement.reentry_source_lot_id)
        : undefined;
      if (balance) {
        balance.quantity -= movement.quantity;
        if (balance.units != null) {
          balance.units -= movement.unit_quantity ?? 0;
        }
      }
    }
    for (const item of orderItems) {
      const itemPrefix = `${prefix}${epoch}:${item.id}:`;
      const already = (prior ?? [])
        .filter((movement) => movement.reentry_key?.startsWith(itemPrefix))
        .reduce((sum, movement) => sum + movement.quantity, 0);
      let remaining = Math.max(0, item.quantity - already);
      for (const lot of lots) {
        if (
          lot.product_id !== item.product_id ||
          lot.product_variant_id !== item.product_variant_id ||
          remaining <= 0
        ) {
          continue;
        }
        const balance = balances.get(lot.id);
        if (!balance || balance.quantity <= 0) {
          continue;
        }
        const quantity = Math.min(remaining, balance.quantity);
        const units =
          balance.units == null
            ? null
            : (balance.units * quantity) / balance.quantity;
        entries.push({
          sourceLotId: lot.id,
          quantity,
          unitQuantity: units,
          reason: params.reason,
          operationKey: `${itemPrefix}${lot.id}`,
        });
        balance.quantity -= quantity;
        if (balance.units != null && units != null) {
          balance.units -= units;
        }
        remaining -= quantity;
      }
      if (remaining > 0.000_001 && item.product_id) {
        throw new Error(
          "No se pudo reconstruir la cantidad pendiente en los lotes originales del pedido"
        );
      }
    }
  }
  await applyStockReentries({
    supabase,
    orgId,
    entries,
    allowDefaultFallback: params.allowDefaultFallback,
  });
}

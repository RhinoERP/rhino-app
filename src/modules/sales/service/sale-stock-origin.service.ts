import type { SupabaseServerClient } from "@/lib/supabase/server";

/** Include child-order consumption and preserve historical reason-based links. */
export async function getSaleStockOriginLedger(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  saleId: string;
  saleNumber: number | null;
  invoiceNumber: string | null;
  reentryReason: string;
}) {
  const { supabase, orgId } = params;
  const { data: roots, error: rootError } = await supabase
    .from("orders")
    .select("id, order_number")
    .eq("organization_id", orgId)
    .eq("sales_order_id", params.saleId);
  if (rootError) {
    throw new Error(
      "No se pudieron consultar los pedidos de origen de la venta"
    );
  }
  const { data: children, error: childError } = roots.length
    ? await supabase
        .from("orders")
        .select("id, order_number")
        .eq("organization_id", orgId)
        .in(
          "parent_order_id",
          roots.map((order) => order.id)
        )
    : { data: [], error: null };
  if (childError) {
    throw new Error("No se pudieron consultar los subpedidos de origen");
  }
  const orders = [...roots, ...children];
  const prefix =
    params.saleNumber != null
      ? `Venta N${params.saleNumber}`
      : `Venta ${params.invoiceNumber?.trim() || params.saleId}`;
  const quote = (value: string) =>
    `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
  const filters = [
    `reason.eq.${quote(prefix)}`,
    `reason.ilike.${quote(`${prefix} %`)}`,
    `reason.eq.${quote(`Venta confirmada ${params.saleId}`)}`,
    ...orders.map(
      (order) => `reason.like.${quote(`Pedido ${order.order_number} - %`)}`
    ),
  ];
  const { data: outgoing, error: outgoingError } = await supabase
    .from("stock_movements")
    .select("id, lot_id, quantity, unit_quantity")
    .eq("organization_id", orgId)
    .eq("type", "OUTBOUND")
    .or(filters.join(","));
  if (outgoingError) {
    throw new Error(
      `No se pudieron consultar las salidas originales: ${outgoingError.message}`
    );
  }
  const { data: returns, error: returnError } = await supabase
    .from("sales_returns")
    .select("id")
    .eq("organization_id", orgId)
    .eq("sales_order_id", params.saleId);
  if (returnError) {
    throw new Error("No se pudieron consultar las devoluciones anteriores");
  }
  const inboundFilters = [
    `reason.eq.${quote(params.reentryReason)}`,
    `reason.eq.${quote(`Reingreso ${prefix}`)}`,
    `reason.ilike.${quote(`Reingreso ${prefix} %`)}`,
    ...returns.map((row) => `reason.eq.${quote(`Devolución (${row.id})`)}`),
    ...orders.map(
      (order) => `reentry_key.like.${quote(`order-reentry:${order.id}:%`)}`
    ),
  ];
  const { data: inbound, error: inboundError } = await supabase
    .from("stock_movements")
    .select("lot_id, reentry_source_lot_id, quantity, unit_quantity")
    .eq("organization_id", orgId)
    .eq("type", "INBOUND")
    .is("reentry_reversed_at", null)
    .or(inboundFilters.join(","));
  if (inboundError) {
    throw new Error(
      `No se pudieron consultar los reingresos previos: ${inboundError.message}`
    );
  }
  return { outgoing, inbound };
}

export function getOutstandingStockBySource(
  outgoing: Array<{
    lot_id: string;
    quantity: number;
    unit_quantity: number | null;
  }>,
  inbound: Array<{
    lot_id: string;
    reentry_source_lot_id: string | null;
    quantity: number;
    unit_quantity: number | null;
  }>
) {
  const result = new Map<
    string,
    { quantity: number; unitQuantity: number | null }
  >();
  for (const row of outgoing) {
    const balance = result.get(row.lot_id) ?? {
      quantity: 0,
      unitQuantity: null,
    };
    balance.quantity += row.quantity;
    if (row.unit_quantity != null) {
      balance.unitQuantity =
        (balance.unitQuantity ?? 0) + Math.abs(row.unit_quantity);
    }
    result.set(row.lot_id, balance);
  }
  for (const row of inbound) {
    const source = row.reentry_source_lot_id ?? row.lot_id;
    const balance = result.get(source);
    if (balance) {
      balance.quantity -= row.quantity;
      if (balance.unitQuantity != null && row.unit_quantity != null) {
        balance.unitQuantity -= Math.abs(row.unit_quantity);
      }
    }
  }
  return result;
}

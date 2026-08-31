import { truncateMoney } from "@/lib/decimal";
import { createAdminClient } from "@/lib/supabase/admin-client";

type GroupedProductItem = {
  totalQty: number;
  variantStocks: Record<string, Record<string, number>>;
};

async function fetchVariantDetails(
  supabase: ReturnType<typeof createAdminClient>,
  items: Array<{ product_variant_id: string | null }>
): Promise<Map<string, { talle: string; color: string }>> {
  const variantIds = items
    .map((item) => item.product_variant_id)
    .filter(Boolean) as string[];

  const variantMap = new Map<string, { talle: string; color: string }>();
  if (variantIds.length === 0) {
    return variantMap;
  }

  const { data: variants } = await supabase
    .from("product_variants")
    .select("id, talle, color")
    .in("id", variantIds);

  for (const v of variants ?? []) {
    variantMap.set(v.id, { talle: v.talle, color: v.color });
  }

  return variantMap;
}

function groupQuoteItemsByProduct(
  items: Array<{
    product_id: string;
    quantity: number;
    product_variant_id: string | null;
  }>,
  variantMap: Map<string, { talle: string; color: string }>
): Map<string, GroupedProductItem> {
  const grouped = new Map<string, GroupedProductItem>();

  for (const item of items) {
    let group = grouped.get(item.product_id);
    if (!group) {
      group = { totalQty: 0, variantStocks: {} };
      grouped.set(item.product_id, group);
    }

    const qty = Math.max(0, item.quantity);
    group.totalQty += qty;

    if (!item.product_variant_id) {
      continue;
    }

    const variant = variantMap.get(item.product_variant_id);
    if (!variant) {
      continue;
    }

    const { color, talle } = variant;
    if (!group.variantStocks[color]) {
      group.variantStocks[color] = {};
    }
    group.variantStocks[color][talle] =
      (group.variantStocks[color][talle] ?? 0) + qty;
  }

  return grouped;
}

function computeDraftTotals(updatedItems: Array<{ subtotal: number }>): {
  subtotalAmount: number;
  totalAmount: number;
} {
  const subtotalAmount = updatedItems.reduce(
    (sum, item) => truncateMoney(sum + item.subtotal),
    0
  );
  return {
    subtotalAmount,
    totalAmount: truncateMoney(subtotalAmount),
  };
}

export async function createDraftPurchaseFromChildOrder(params: {
  orgId: string;
  orderId: string;
  quoteItemIds: string[];
}): Promise<{ purchaseOrderId: string; purchaseOrderNumber: number }> {
  const supabase = createAdminClient();

  const { data: items, error: itemsError } = await supabase
    .from("quote_items")
    .select("id, product_id, quantity, description, product_variant_id")
    .in("id", params.quoteItemIds);

  if (itemsError || !items || items.length === 0) {
    throw new Error("Error al obtener items del presupuesto");
  }

  const itemsWithProduct = items.filter(
    (item): item is typeof item & { product_id: string } =>
      item.product_id !== null
  );

  if (itemsWithProduct.length === 0) {
    throw new Error("Ningún item del presupuesto tiene un producto asignado");
  }

  const variantMap = await fetchVariantDetails(supabase, itemsWithProduct);

  const grouped = groupQuoteItemsByProduct(itemsWithProduct, variantMap);

  const productIds = Array.from(grouped.keys());

  const { data: productCosts } = await supabase
    .from("products_with_price")
    .select("id, cost_price")
    .eq("organization_id", params.orgId)
    .in("id", productIds);

  const costMap = new Map(
    (productCosts ?? [])
      .filter(
        (p): p is typeof p & { id: string; cost_price: number } =>
          p.id !== null && p.cost_price !== null
      )
      .map((p) => [p.id, p.cost_price])
  );

  const { data: lastPurchase } = await supabase
    .from("purchase_orders")
    .select("purchase_number")
    .eq("organization_id", params.orgId)
    .order("purchase_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const purchaseNumber = (lastPurchase?.purchase_number ?? 0) + 1;

  const { data: purchaseOrder, error: poError } = await supabase
    .from("purchase_orders")
    .insert({
      organization_id: params.orgId,
      purchase_number: purchaseNumber,
      status: "DRAFT",
      subtotal_amount: 0,
      tax_amount: 0,
      total_amount: 0,
    })
    .select("id")
    .single();

  if (poError || !purchaseOrder) {
    throw new Error(`Error al crear pre-compra: ${poError?.message}`);
  }

  const purchaseItems = Array.from(grouped.entries()).map(
    ([productId, group]) => {
      const unitCost = costMap.get(productId) ?? 0;
      const subtotal = truncateMoney(unitCost * group.totalQty);
      return {
        organization_id: params.orgId,
        purchase_order_id: purchaseOrder.id,
        product_id: productId,
        quantity: group.totalQty,
        unit_cost: unitCost,
        subtotal,
        variant_stocks:
          Object.keys(group.variantStocks).length > 0
            ? group.variantStocks
            : null,
      };
    }
  );

  const { error: piError } = await supabase
    .from("purchase_order_items")
    .insert(purchaseItems);

  if (piError) {
    await supabase.from("purchase_orders").delete().eq("id", purchaseOrder.id);
    throw new Error(`Error al crear items de pre-compra: ${piError.message}`);
  }

  const { subtotalAmount, totalAmount } = computeDraftTotals(purchaseItems);

  const { error: totalsError } = await supabase
    .from("purchase_orders")
    .update({
      subtotal_amount: subtotalAmount,
      total_amount: totalAmount,
    })
    .eq("id", purchaseOrder.id);

  if (totalsError) {
    await supabase
      .from("purchase_order_items")
      .delete()
      .eq("purchase_order_id", purchaseOrder.id);
    await supabase.from("purchase_orders").delete().eq("id", purchaseOrder.id);
    throw new Error(
      `Error al actualizar totales de pre-compra: ${totalsError.message}`
    );
  }

  const { data: products } = await supabase
    .from("products")
    .select("supplier_id")
    .in("id", productIds);

  const uniqueSupplierIds = [
    ...new Set((products ?? []).map((p) => p.supplier_id).filter(Boolean)),
  ] as string[];

  if (uniqueSupplierIds.length === 1) {
    const supplierId = uniqueSupplierIds[0];
    const { error: supplierError } = await supabase
      .from("purchase_orders")
      .update({ supplier_id: supplierId })
      .eq("id", purchaseOrder.id);

    if (supplierError) {
      await supabase
        .from("purchase_order_items")
        .delete()
        .eq("purchase_order_id", purchaseOrder.id);
      await supabase
        .from("purchase_orders")
        .delete()
        .eq("id", purchaseOrder.id);
      throw new Error(
        `Error al asignar proveedor a pre-compra: ${supplierError.message}`
      );
    }
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update({ purchase_order_id: purchaseOrder.id })
    .eq("id", params.orderId);

  if (updateError) {
    await supabase
      .from("purchase_order_items")
      .delete()
      .eq("purchase_order_id", purchaseOrder.id);
    await supabase.from("purchase_orders").delete().eq("id", purchaseOrder.id);
    throw new Error(
      `Error al vincular pedido hijo con pre-compra: ${updateError.message}`
    );
  }

  return {
    purchaseOrderId: purchaseOrder.id,
    purchaseOrderNumber: purchaseNumber,
  };
}

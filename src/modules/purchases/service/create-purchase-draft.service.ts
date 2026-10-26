import { truncateMoney } from "@/lib/decimal";
import { createAdminClient } from "@/lib/supabase/admin-client";
import {
  buildPurchaseTaxPlan,
  persistPurchaseFiscalState,
} from "./purchase-tax-snapshots.service";

type GroupedProductItem = {
  totalQty: number;
  variantStocks: Record<string, Record<string, number>>;
};

async function fetchVariantDetails(
  supabase: ReturnType<typeof createAdminClient>,
  orgId: string,
  items: Array<{ product_variant_id: string | null; product_id: string }>
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
    .select("id, talle, color, product_id")
    .eq("organization_id", orgId)
    .in("id", variantIds);

  const byId = new Map(
    (variants ?? []).map((variant) => [variant.id, variant])
  );
  for (const item of items) {
    if (!item.product_variant_id) {
      continue;
    }
    const variant = byId.get(item.product_variant_id);
    if (!variant || variant.product_id !== item.product_id) {
      throw new Error(
        "Una variante no pertenece al producto y organización de la pre-compra"
      );
    }
  }

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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: order->purchase draft creation iterates quote items and resolves variants/costs
export async function createDraftPurchaseFromChildOrder(params: {
  orgId: string;
  orderId: string;
  quoteItemIds: string[];
}): Promise<{ purchaseOrderId: string; purchaseOrderNumber: number }> {
  const supabase = createAdminClient();

  if (
    params.quoteItemIds.length === 0 ||
    new Set(params.quoteItemIds).size !== params.quoteItemIds.length
  ) {
    throw new Error("Los ítems solicitados para la pre-compra son inválidos");
  }
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, quote_id, purchase_order_id")
    .eq("id", params.orderId)
    .eq("organization_id", params.orgId)
    .single();
  if (orderError || !order?.quote_id || order.purchase_order_id) {
    throw new Error(
      "El pedido no pertenece a la organización o ya tiene una pre-compra"
    );
  }
  const { data: quote } = await supabase
    .from("quotes")
    .select("id")
    .eq("id", order.quote_id)
    .eq("organization_id", params.orgId)
    .single();
  if (!quote) {
    throw new Error("El presupuesto del pedido no pertenece a la organización");
  }

  const { data: items, error: itemsError } = await supabase
    .from("quote_items")
    .select(
      "id, quote_id, product_id, quantity, description, product_variant_id, assigned_order_id"
    )
    .eq("quote_id", order.quote_id)
    .in("id", params.quoteItemIds);

  if (
    itemsError ||
    !items ||
    items.length !== params.quoteItemIds.length ||
    items.some(
      (item) =>
        item.assigned_order_id && item.assigned_order_id !== params.orderId
    )
  ) {
    throw new Error(
      "Los ítems no pertenecen al presupuesto y pedido indicados"
    );
  }

  const itemsWithProduct = items.filter(
    (item): item is typeof item & { product_id: string } =>
      item.product_id !== null
  );

  if (itemsWithProduct.length === 0) {
    throw new Error("Ningún item del presupuesto tiene un producto asignado");
  }

  const variantMap = await fetchVariantDetails(
    supabase,
    params.orgId,
    itemsWithProduct
  );

  const grouped = groupQuoteItemsByProduct(itemsWithProduct, variantMap);

  const productIds = Array.from(grouped.keys());
  const { data: ownedProducts, error: productsError } = await supabase
    .from("products")
    .select("id, supplier_id")
    .eq("organization_id", params.orgId)
    .in("id", productIds);
  if (productsError || ownedProducts?.length !== productIds.length) {
    throw new Error("Uno o más productos no pertenecen a la organización");
  }
  const supplierIds = [
    ...new Set(
      (ownedProducts ?? [])
        .map((product) => product.supplier_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const supplierId = supplierIds.length === 1 ? supplierIds[0] : null;
  if (supplierId) {
    const { data: supplier } = await supabase
      .from("suppliers")
      .select("id")
      .eq("id", supplierId)
      .eq("organization_id", params.orgId)
      .single();
    if (!supplier) {
      throw new Error(
        "El proveedor de la pre-compra no pertenece a la organización"
      );
    }
  }

  const { data: productCosts } = await supabase
    .from("products_with_price")
    .select("id, cost_price, currency")
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

  // La OC se crea en la moneda del costo del producto (lista de precios), no
  // en la del presupuesto. Asumimos una OC por proveedor con costos en una
  // sola moneda; si mezclan, se toma la primera.
  const purchaseCurrency =
    (productCosts ?? []).find((p) => p.cost_price !== null)?.currency ?? "ARS";

  const MAX_PURCHASE_NUMBER_RETRIES = 3;
  let purchaseOrder: { id: string } | null = null;
  let poError: { message: string; code?: string } | null = null;
  let purchaseNumber = 0;

  for (let attempt = 0; attempt < MAX_PURCHASE_NUMBER_RETRIES; attempt++) {
    const { data: lastPurchase } = await supabase
      .from("purchase_orders")
      .select("purchase_number")
      .eq("organization_id", params.orgId)
      .order("purchase_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    purchaseNumber = (lastPurchase?.purchase_number ?? 0) + 1;

    const result = await supabase
      .from("purchase_orders")
      .insert({
        organization_id: params.orgId,
        supplier_id: supplierId,
        purchase_number: purchaseNumber,
        status: "DRAFT",
        currency: purchaseCurrency,
        subtotal_amount: 0,
        tax_amount: 0,
        tax_snapshot_initialized: true,
        total_amount: 0,
      })
      .select("id")
      .single();

    purchaseOrder = result.data;
    poError = result.error;

    if (!poError || poError.code !== "23505") {
      break;
    }
  }

  if (poError || !purchaseOrder) {
    throw new Error(`Error al crear pre-compra: ${poError?.message}`);
  }

  const purchaseItems = Array.from(grouped.entries()).map(
    ([productId, group]) => {
      const unitCost = costMap.get(productId) ?? 0;
      const subtotal = truncateMoney(unitCost * group.totalQty);
      return {
        id: crypto.randomUUID(),
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

  const { subtotalAmount } = computeDraftTotals(purchaseItems);
  try {
    const taxPlan = await buildPurchaseTaxPlan({
      supabase,
      orgId: params.orgId,
      lines: purchaseItems.map((item) => ({
        id: item.id,
        product_id: item.product_id,
        subtotal: item.subtotal,
      })),
      globalDiscountAmount: 0,
    });
    await persistPurchaseFiscalState({
      supabase,
      orgId: params.orgId,
      orderId: purchaseOrder.id,
      mode: "confirm",
      items: purchaseItems.map((item) => ({
        ...item,
        unit_quantity: null,
        tax_override: null,
      })),
      plan: taxPlan,
      subtotal: subtotalAmount,
      discountPercentage: 0,
      discountAmount: 0,
      fallbackTaxes: [],
      supplierId,
      purchaseDate: new Date().toISOString().split("T")[0] ?? "",
      expirationDate: null,
      remittanceNumber: null,
    });
  } catch (error) {
    await supabase
      .from("purchase_order_item_taxes")
      .delete()
      .eq("purchase_order_id", purchaseOrder.id)
      .eq("organization_id", params.orgId);
    await supabase
      .from("purchase_order_taxes")
      .delete()
      .eq("purchase_order_id", purchaseOrder.id)
      .eq("organization_id", params.orgId);
    await supabase
      .from("purchase_order_items")
      .delete()
      .eq("purchase_order_id", purchaseOrder.id)
      .eq("organization_id", params.orgId);
    await supabase
      .from("purchase_orders")
      .delete()
      .eq("id", purchaseOrder.id)
      .eq("organization_id", params.orgId);
    throw error;
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update({ purchase_order_id: purchaseOrder.id })
    .eq("id", params.orderId)
    .eq("organization_id", params.orgId);

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

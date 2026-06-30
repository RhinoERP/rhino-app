import { z } from "zod";
import { truncateMoney } from "@/lib/decimal";
import { createClient } from "@/lib/supabase/server";
import type { CollectionAccountStatus } from "@/modules/collections/types";
import { recalcParentOrderStatus } from "@/modules/orders/service/orders.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { Database } from "@/types/supabase";

export type PurchaseOrder =
  Database["public"]["Tables"]["purchase_orders"]["Row"];
export type PurchaseOrderItem =
  Database["public"]["Tables"]["purchase_order_items"]["Row"];
export type ProductWithPrice =
  Database["public"]["Views"]["products_with_price"]["Row"] & {
    has_variants: boolean;
  };
type AccountsPayableRow =
  Database["public"]["Tables"]["accounts_payable"]["Row"];
type ExistingAccountsPayable = Pick<
  AccountsPayableRow,
  "id" | "total_amount" | "pending_balance"
>;
type ExistingAccountsPayableWithDueDate = Pick<
  AccountsPayableRow,
  "id" | "due_date"
>;

const recalculatedTotalsSchema = z.object({
  subtotal: z.number().finite().nonnegative(),
  tax_amount: z.number().finite().nonnegative(),
  global_discount_percentage: z.number().finite().min(0).max(100),
  global_discount_amount: z.number().finite().nonnegative(),
  total_amount: z.number().finite().nonnegative(),
});

const derivePayableStatus = (
  totalAmount: number,
  pendingBalance: number
): CollectionAccountStatus => {
  if (pendingBalance <= 0) {
    return "PAID";
  }
  if (pendingBalance < totalAmount) {
    return "PARTIAL";
  }
  return "PENDING";
};

type PurchaseTaxInput = {
  tax_id: string;
  name: string;
  rate: number;
};

function calculateGlobalDiscount(subtotalAmount: number, discountPercent = 0) {
  const normalizedSubtotal = truncateMoney(Math.max(0, subtotalAmount));
  const global_discount_percentage = Math.min(
    Math.max(0, discountPercent),
    100
  );
  const global_discount_amount = truncateMoney(
    Math.min(
      Math.max(0, (global_discount_percentage / 100) * normalizedSubtotal),
      normalizedSubtotal
    )
  );
  const taxable_base_amount = truncateMoney(
    Math.max(0, normalizedSubtotal - global_discount_amount)
  );

  return {
    global_discount_percentage,
    global_discount_amount,
    taxable_base_amount,
  };
}

function calculateTaxAmounts(
  taxes: PurchaseTaxInput[] | undefined,
  taxableBaseAmount: number
) {
  const normalizedBase = truncateMoney(Math.max(0, taxableBaseAmount));
  const taxAmounts = (taxes ?? []).map((tax) => ({
    ...tax,
    base_amount: normalizedBase,
    tax_amount: truncateMoney(normalizedBase * (tax.rate / 100)),
  }));
  const total_tax_amount = taxAmounts.reduce(
    (sum, tax) => truncateMoney(sum + tax.tax_amount),
    0
  );

  return { taxAmounts, total_tax_amount };
}

async function syncAccountsPayable(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  orgId: string;
  supplierId: string;
  purchaseOrderId: string;
  totalAmount: number;
  dueDate: string;
}) {
  const { supabase, orgId, supplierId, purchaseOrderId, totalAmount, dueDate } =
    params;
  const normalizedTotalAmount = truncateMoney(totalAmount);

  const { data: existingData, error: fetchError } = await supabase
    .from("accounts_payable")
    .select("id, total_amount, pending_balance")
    .eq("purchase_order_id", purchaseOrderId)
    .eq("organization_id", orgId)
    .maybeSingle();
  const existing = existingData as ExistingAccountsPayable | null;

  if (fetchError) {
    throw new Error(
      `No se pudo obtener la cuenta por pagar: ${fetchError.message}`
    );
  }

  const paidAmount = existing
    ? truncateMoney(
        Math.max(
          0,
          Number(existing.total_amount ?? 0) -
            Number(existing.pending_balance ?? 0)
        )
      )
    : 0;

  const newPendingBalance = truncateMoney(
    Math.max(0, normalizedTotalAmount - paidAmount)
  );
  const newStatus = derivePayableStatus(
    normalizedTotalAmount,
    newPendingBalance
  );

  if (existing?.id) {
    const { error: updateError } = await supabase
      .from("accounts_payable")
      .update({
        supplier_id: supplierId,
        total_amount: normalizedTotalAmount,
        pending_balance: truncateMoney(newPendingBalance),
        due_date: dueDate,
        status: newStatus,
      })
      .eq("id", existing.id)
      .eq("organization_id", orgId);

    if (updateError) {
      throw new Error(
        `No se pudo actualizar la cuenta por pagar: ${updateError.message}`
      );
    }
    return;
  }

  const { error: insertError } = await supabase
    .from("accounts_payable")
    .insert({
      organization_id: orgId,
      supplier_id: supplierId,
      purchase_order_id: purchaseOrderId,
      total_amount: normalizedTotalAmount,
      pending_balance: normalizedTotalAmount,
      due_date: dueDate,
      status: "PENDING",
    });

  if (insertError) {
    throw new Error(
      `No se pudo crear la cuenta por pagar: ${insertError.message}`
    );
  }
}

async function syncAccountsPayableAfterTotalRecalculation(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  orgId: string;
  supplierId: string | null;
  purchaseOrderId: string;
  purchaseDate: string;
  expirationDate: string | null;
  totalAmount: number;
}) {
  const {
    supabase,
    orgId,
    supplierId,
    purchaseOrderId,
    purchaseDate,
    expirationDate,
    totalAmount,
  } = params;

  if (!supplierId) {
    return;
  }

  const { data: existingPayableData, error: existingPayableError } =
    await supabase
      .from("accounts_payable")
      .select("id, due_date")
      .eq("purchase_order_id", purchaseOrderId)
      .eq("organization_id", orgId)
      .maybeSingle();
  const existingPayable =
    existingPayableData as ExistingAccountsPayableWithDueDate | null;

  if (existingPayableError) {
    throw new Error(
      `No se pudo obtener la cuenta por pagar para sincronizar totales: ${existingPayableError.message}`
    );
  }

  if (!(existingPayable?.id || expirationDate)) {
    return;
  }

  const dueDate = existingPayable?.due_date ?? expirationDate ?? purchaseDate;

  await syncAccountsPayable({
    supabase,
    orgId,
    supplierId,
    purchaseOrderId,
    totalAmount,
    dueDate,
  });
}

function validateRecalculatedTotals(input: {
  subtotal: number;
  tax_amount: number;
  global_discount_percentage: number;
  global_discount_amount: number;
  total_amount: number;
}) {
  const parsed = recalculatedTotalsSchema.safeParse({
    subtotal: truncateMoney(input.subtotal),
    tax_amount: truncateMoney(input.tax_amount),
    global_discount_percentage: input.global_discount_percentage,
    global_discount_amount: truncateMoney(input.global_discount_amount),
    total_amount: truncateMoney(input.total_amount),
  });

  if (!parsed.success) {
    throw new Error(
      `Montos recalculados inválidos para la compra: ${parsed.error.issues
        .map((issue) => issue.message)
        .join(", ")}`
    );
  }

  return parsed.data;
}

export type CreatePurchaseOrderInput = {
  orgSlug: string;
  supplier_id: string;
  purchase_date: string;
  expiration_date?: string;
  remittance_number?: string;
  items: {
    product_id: string;
    quantity: number;
    unit_quantity: number;
    unit_cost: number;
    subtotal: number;
    variant_stocks?: Record<string, Record<string, number>>;
  }[];
  taxes?: {
    tax_id: string;
    name: string;
    rate: number;
  }[];
  global_discount_percentage?: number;
};

/**
 * Returns all products with prices for a specific supplier
 */
export async function getProductsBySupplier(
  orgSlug: string,
  supplierId: string
): Promise<ProductWithPrice[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("products_with_price")
    .select("*")
    .eq("organization_id", org.id)
    .eq("supplier_id", supplierId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Error fetching products: ${error.message}`);
  }

  const productIds = (data?.map((p) => p.id).filter(Boolean) as string[]) ?? [];

  const { data: variantFlags } = await supabase
    .from("products")
    .select("id, has_variants")
    .in("id", productIds);

  const hasVariantsMap: Record<string, boolean> = {};
  for (const row of variantFlags ?? []) {
    hasVariantsMap[row.id] = row.has_variants ?? false;
  }

  return (data ?? []).map((product) => ({
    ...product,
    has_variants: hasVariantsMap[product.id ?? ""] ?? false,
  }));
}

/**
 * Returns all products with prices for an organization
 */
export async function getAllProductsByOrg(
  orgSlug: string
): Promise<ProductWithPrice[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("products_with_price")
    .select("*")
    .eq("organization_id", org.id)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Error fetching products: ${error.message}`);
  }

  const productIds = (data?.map((p) => p.id).filter(Boolean) as string[]) ?? [];

  const { data: variantFlags } = await supabase
    .from("products")
    .select("id, has_variants")
    .in("id", productIds);

  const hasVariantsMap: Record<string, boolean> = {};
  for (const row of variantFlags ?? []) {
    hasVariantsMap[row.id] = row.has_variants ?? false;
  }

  return (data ?? []).map((product) => ({
    ...product,
    has_variants: hasVariantsMap[product.id ?? ""] ?? false,
  }));
}

/**
 * Inserts purchase order items
 */
async function insertPurchaseOrderItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  purchaseOrderId: string,
  items: CreatePurchaseOrderInput["items"]
): Promise<void> {
  const itemsToInsert = items.map((item) => ({
    organization_id: orgId,
    purchase_order_id: purchaseOrderId,
    product_id: item.product_id,
    quantity: Math.max(1, item.quantity),
    unit_quantity: item.unit_quantity,
    unit_cost: truncateMoney(item.unit_cost),
    subtotal: truncateMoney(item.subtotal),
    variant_stocks: item.variant_stocks ?? null,
  }));

  const { error } = await supabase
    .from("purchase_order_items")
    .insert(itemsToInsert);

  if (error) {
    throw new Error(`Error creating purchase order items: ${error.message}`);
  }
}

/**
 * Inserts purchase order taxes
 */
async function insertPurchaseOrderTaxes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  purchaseOrderId: string,
  taxAmounts: Array<{
    tax_id: string;
    name: string;
    rate: number;
    base_amount: number;
    tax_amount: number;
  }>
): Promise<void> {
  if (taxAmounts.length === 0) {
    return;
  }

  const taxesToInsert = taxAmounts.map((tax) => ({
    organization_id: orgId,
    purchase_order_id: purchaseOrderId,
    tax_id: tax.tax_id,
    name: tax.name,
    rate: tax.rate,
    base_amount: truncateMoney(tax.base_amount),
    tax_amount: truncateMoney(tax.tax_amount),
  }));

  const { error } = await supabase
    .from("purchase_order_taxes")
    .insert(taxesToInsert);

  if (error) {
    throw new Error(`Error creating purchase order taxes: ${error.message}`);
  }
}

/**
 * Rolls back a failed purchase order creation
 */
async function rollbackPurchaseOrder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  purchaseOrderId: string
): Promise<void> {
  await supabase
    .from("purchase_order_items")
    .delete()
    .eq("purchase_order_id", purchaseOrderId)
    .eq("organization_id", orgId);
  await supabase
    .from("purchase_order_taxes")
    .delete()
    .eq("purchase_order_id", purchaseOrderId)
    .eq("organization_id", orgId);
  await supabase
    .from("purchase_orders")
    .delete()
    .eq("id", purchaseOrderId)
    .eq("organization_id", orgId);
}

/**
 * Creates a new purchase order with its items
 */
export async function createPurchaseOrder(
  input: CreatePurchaseOrderInput
): Promise<PurchaseOrder> {
  const org = await getOrganizationBySlug(input.orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  if (!input.items || input.items.length === 0) {
    throw new Error("La orden de compra debe tener al menos un producto");
  }

  const supabase = await createClient();

  const subtotal_amount = input.items.reduce(
    (sum, item) => truncateMoney(sum + truncateMoney(item.subtotal)),
    0
  );

  const {
    global_discount_percentage,
    global_discount_amount,
    taxable_base_amount,
  } = calculateGlobalDiscount(
    subtotal_amount,
    input.global_discount_percentage ?? 0
  );
  const { taxAmounts, total_tax_amount } = calculateTaxAmounts(
    input.taxes,
    taxable_base_amount
  );

  const total_amount = truncateMoney(
    Math.max(0, taxable_base_amount + total_tax_amount)
  );

  const { data: lastPurchase } = await supabase
    .from("purchase_orders")
    .select("purchase_number")
    .eq("organization_id", org.id)
    .order("purchase_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const purchaseNumber = (lastPurchase?.purchase_number ?? 0) + 1;

  const { data: purchaseOrder, error: orderError } = await supabase
    .from("purchase_orders")
    .insert({
      organization_id: org.id,
      supplier_id: input.supplier_id,
      purchase_date: input.purchase_date,
      expiration_date: input.expiration_date,
      remittance_number: input.remittance_number,
      purchase_number: purchaseNumber,
      subtotal_amount,
      tax_amount: total_tax_amount,
      global_discount_percentage,
      global_discount_amount,
      total_amount,
      status: "ORDERED",
    })
    .select("*")
    .single();

  if (orderError || !purchaseOrder) {
    throw new Error(`Error creating purchase order: ${orderError?.message}`);
  }

  try {
    await insertPurchaseOrderItems(
      supabase,
      org.id,
      purchaseOrder.id,
      input.items
    );
    await insertPurchaseOrderTaxes(
      supabase,
      org.id,
      purchaseOrder.id,
      taxAmounts
    );

    // Only create payable account if expiration_date is provided
    const payableDueDate = input.expiration_date ?? null;
    if (payableDueDate) {
      await syncAccountsPayable({
        supabase,
        orgId: org.id,
        supplierId: input.supplier_id,
        purchaseOrderId: purchaseOrder.id,
        totalAmount: total_amount,
        dueDate: payableDueDate,
      });
    }
  } catch (error) {
    await rollbackPurchaseOrder(supabase, org.id, purchaseOrder.id);
    throw error instanceof Error
      ? error
      : new Error("No se pudo crear la cuenta por pagar");
  }

  return purchaseOrder;
}

async function fetchVariantDetails(
  supabase: Awaited<ReturnType<typeof createClient>>,
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

type GroupedProductItem = {
  totalQty: number;
  variantStocks: Record<string, Record<string, number>>;
};

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

    const qty = Math.max(1, item.quantity);
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

export async function createDraftPurchaseFromChildOrder(params: {
  orgId: string;
  orderId: string;
  quoteItemIds: string[];
}): Promise<{ purchaseOrderId: string; purchaseOrderNumber: number }> {
  const supabase = await createClient();

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

export async function advanceLinkedChildOrderToGoodsReceived(
  purchaseOrderId: string,
  orgId: string
): Promise<void> {
  const supabase = await createClient();

  const { data: linkedOrder } = await supabase
    .from("orders")
    .select("id, status, parent_order_id")
    .eq("purchase_order_id", purchaseOrderId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!linkedOrder || linkedOrder.status !== "PURCHASING") {
    return;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase
    .from("orders")
    .update({ status: "GOODS_RECEIVED" })
    .eq("id", linkedOrder.id);

  await supabase.from("order_status_history").insert({
    order_id: linkedOrder.id,
    to_status: "GOODS_RECEIVED",
    from_status: "PURCHASING",
    notes: "Compra recibida - Mercadería disponible",
    changed_by: user?.id ?? null,
    changed_at: new Date().toISOString(),
  });

  if (linkedOrder.parent_order_id) {
    await recalcParentOrderStatus(linkedOrder.parent_order_id, orgId);
  }
}

async function buildCostMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  items: PurchaseOrderItem[]
): Promise<Record<string, number>> {
  const productIds = items
    .map((item) => item.product_id)
    .filter(Boolean) as string[];

  const { data: priceData } = await supabase
    .from("products_with_price")
    .select("id, cost_price")
    .eq("organization_id", orgId)
    .in("id", productIds);

  const costMap: Record<string, number> = {};
  for (const row of priceData ?? []) {
    if (row.id && row.cost_price) {
      costMap[row.id] = row.cost_price;
    }
  }
  return costMap;
}

function calculateItemCost(
  item: PurchaseOrderItem,
  costMap: Record<string, number>
): { unit_cost: number; subtotal: number } {
  const existingCost = item.unit_cost ?? 0;
  const hasExistingCost = existingCost > 0;
  const costPrice = hasExistingCost
    ? existingCost
    : (costMap[item.product_id ?? ""] ?? 0);
  const subtotal = truncateMoney(costPrice * Math.max(1, item.quantity));
  return {
    unit_cost: hasExistingCost ? existingCost : truncateMoney(costPrice),
    subtotal: truncateMoney(subtotal),
  };
}

async function calculateDraftItemCosts(
  items: PurchaseOrderItem[],
  orgId: string,
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<(PurchaseOrderItem & { unit_cost: number; subtotal: number })[]> {
  const costMap = await buildCostMap(supabase, orgId, items);

  return items.map((item) => {
    const costs = calculateItemCost(item, costMap);
    return { ...item, ...costs };
  });
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

async function updateDraftToOrdered(options: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  purchaseOrderId: string;
  supplierId: string;
  orgId: string;
  subtotalAmount: number;
  totalAmount: number;
}): Promise<void> {
  const {
    supabase,
    purchaseOrderId,
    supplierId,
    orgId,
    subtotalAmount,
    totalAmount,
  } = options;
  const { error: updatePoError } = await supabase
    .from("purchase_orders")
    .update({
      supplier_id: supplierId,
      status: "ORDERED",
      purchase_date: new Date().toISOString().split("T")[0],
      subtotal_amount: subtotalAmount,
      tax_amount: 0,
      total_amount: totalAmount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", purchaseOrderId)
    .eq("organization_id", orgId);

  if (updatePoError) {
    throw new Error(`Error al confirmar pre-compra: ${updatePoError.message}`);
  }
}

async function updateDraftItemPrices(
  supabase: Awaited<ReturnType<typeof createClient>>,
  updatedItems: Array<{ id: string; unit_cost: number; subtotal: number }>,
  orgId: string
): Promise<void> {
  for (const item of updatedItems) {
    const { error: itemError } = await supabase
      .from("purchase_order_items")
      .update({
        unit_cost: item.unit_cost,
        subtotal: item.subtotal,
      })
      .eq("id", item.id)
      .eq("organization_id", orgId);

    if (itemError) {
      throw new Error(
        `Error al actualizar item de compra: ${itemError.message}`
      );
    }
  }
}

async function advanceLinkedChildOrder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  purchaseOrderId: string,
  orgId: string
): Promise<void> {
  const { data: linkedOrder } = await supabase
    .from("orders")
    .select("id, status, parent_order_id")
    .eq("purchase_order_id", purchaseOrderId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!linkedOrder || linkedOrder.status !== "PURCHASE_REQUIRED") {
    return;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase
    .from("orders")
    .update({ status: "PURCHASING" })
    .eq("id", linkedOrder.id);

  await supabase.from("order_status_history").insert({
    order_id: linkedOrder.id,
    to_status: "PURCHASING",
    from_status: "PURCHASE_REQUIRED",
    notes: "Pre-compra confirmada - Productos en proceso de compra",
    changed_by: user?.id ?? null,
    changed_at: new Date().toISOString(),
  });
}

export async function confirmDraftPurchaseOrder(params: {
  orgSlug: string;
  purchaseOrderId: string;
  supplierId: string;
  expirationDate?: string;
}): Promise<PurchaseOrder> {
  const supabase = await createClient();
  const org = await getOrganizationBySlug(params.orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const { data: purchaseOrder, error: poError } = await supabase
    .from("purchase_orders")
    .select("*, items:purchase_order_items(*)")
    .eq("id", params.purchaseOrderId)
    .eq("organization_id", org.id)
    .single();

  if (poError || !purchaseOrder) {
    throw new Error("Orden de compra no encontrada");
  }

  if (purchaseOrder.status !== "DRAFT") {
    throw new Error("La orden de compra no está en estado Borrador");
  }

  const items = purchaseOrder.items as PurchaseOrderItem[] | undefined;
  if (!items || items.length === 0) {
    throw new Error("La pre-compra no tiene items");
  }

  const updatedItems = await calculateDraftItemCosts(items, org.id, supabase);

  const { subtotalAmount, totalAmount } = computeDraftTotals(updatedItems);

  await updateDraftToOrdered({
    supabase,
    purchaseOrderId: params.purchaseOrderId,
    supplierId: params.supplierId,
    orgId: org.id,
    subtotalAmount,
    totalAmount,
  });

  await updateDraftItemPrices(supabase, updatedItems, org.id);

  if (params.expirationDate) {
    await syncAccountsPayable({
      supabase,
      orgId: org.id,
      supplierId: params.supplierId,
      purchaseOrderId: params.purchaseOrderId,
      totalAmount,
      dueDate: params.expirationDate,
    });
  }

  await advanceLinkedChildOrder(supabase, params.purchaseOrderId, org.id);

  const { data: confirmedOrder, error: refetchError } = await supabase
    .from("purchase_orders")
    .select("*")
    .eq("id", params.purchaseOrderId)
    .single();

  if (refetchError || !confirmedOrder) {
    throw new Error("Error al obtener orden confirmada");
  }

  return confirmedOrder;
}

export type PurchaseOrderWithSupplier = PurchaseOrder & {
  supplier: {
    id: string;
    name: string;
  };
  items?: PurchaseExportItem[];
};

export type PurchaseExportItem = {
  productId: string | null;
  productName: string | null;
  units: number | null;
  unitQuantity: number | null;
  unitOfMeasure: Database["public"]["Enums"]["unit_of_measure_type"] | null;
  subtotal: number | null;
};

type PurchaseOrderItemRaw = Partial<
  Database["public"]["Tables"]["purchase_order_items"]["Row"]
> & {
  product?: {
    id?: string | null;
    name?: string | null;
    unit_of_measure?:
      | Database["public"]["Enums"]["unit_of_measure_type"]
      | null;
  } | null;
};

type PurchaseOrderWithSupplierRaw = PurchaseOrder & {
  supplier:
    | {
        id: string;
        name: string;
      }
    | Array<{
        id: string;
        name: string;
      }>
    | null;
  items?: PurchaseOrderItemRaw[] | null;
};

function normalizePurchaseExportItem(
  item: PurchaseOrderItemRaw
): PurchaseExportItem {
  const productId =
    (item.product_id as string | null) ??
    (item.product?.id as string | null) ??
    null;

  return {
    productId,
    productName: (item.product?.name as string | null) ?? productId,
    units:
      item.quantity !== null && item.quantity !== undefined
        ? Number(item.quantity)
        : null,
    unitQuantity:
      item.unit_quantity !== null && item.unit_quantity !== undefined
        ? Number(item.unit_quantity)
        : null,
    unitOfMeasure: item.product?.unit_of_measure ?? null,
    subtotal:
      item.subtotal !== null && item.subtotal !== undefined
        ? Number(item.subtotal)
        : null,
  };
}

/**
 * Gets all purchase orders for an organization with supplier information
 */
export async function getPurchaseOrdersByOrgSlug(
  orgSlug: string
): Promise<PurchaseOrderWithSupplier[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("purchase_orders")
    .select(`
      *,
      supplier:suppliers(id, name),
      items:purchase_order_items(
        quantity,
        unit_quantity,
        subtotal,
        product_id,
        product:products(id, name, unit_of_measure)
      )
    `)
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Error fetching purchase orders: ${error.message}`);
  }

  if (!data) {
    return [];
  }

  return data.map((order: PurchaseOrderWithSupplierRaw) => {
    const supplier = order.supplier;
    const supplierData = Array.isArray(supplier) ? supplier[0] : supplier;
    const purchaseItems: PurchaseExportItem[] = (order.items ?? []).map(
      normalizePurchaseExportItem
    );

    const normalizedSupplier =
      supplierData &&
      typeof supplierData === "object" &&
      "id" in supplierData &&
      "name" in supplierData
        ? supplierData
        : {
            id: order.supplier_id,
            name: "Sin asignar",
          };

    return {
      ...order,
      supplier: normalizedSupplier,
      items: purchaseItems,
    };
  }) as PurchaseOrderWithSupplier[];
}

export type PurchasesExportRow = {
  purchase_id: string;
  purchase_number: number | null;
  purchase_date: string | null;
  supplier_name: string;
  status: PurchaseOrderWithSupplier["status"];
  total_amount: number;
  subtotal: number;
};

function calculatePurchasesExportSubtotal(
  purchase: PurchaseOrderWithSupplier
): number {
  const base = Number(purchase.subtotal_amount ?? 0);
  const discount = Number(purchase.global_discount_amount ?? 0);
  const safeBase = Number.isFinite(base) ? base : 0;
  const safeDiscount = Number.isFinite(discount) ? discount : 0;

  return truncateMoney(safeBase - safeDiscount);
}

export async function exportPurchasesService(
  orgSlug: string
): Promise<PurchasesExportRow[]> {
  const purchases = await getPurchaseOrdersByOrgSlug(orgSlug);

  return purchases.map((purchase) => ({
    purchase_id: purchase.id,
    purchase_number:
      purchase.purchase_number !== undefined &&
      purchase.purchase_number !== null
        ? Number(purchase.purchase_number)
        : null,
    purchase_date: purchase.purchase_date ?? null,
    supplier_name: purchase.supplier?.name || "Proveedor desconocido",
    status: purchase.status,
    total_amount: truncateMoney(Number(purchase.total_amount ?? 0)),
    subtotal: calculatePurchasesExportSubtotal(purchase),
  }));
}

/**
 * Gets the last N purchase orders for a specific supplier
 */
export async function getRecentPurchaseOrdersBySupplier(
  orgSlug: string,
  supplierId: string,
  limit = 3
): Promise<PurchaseOrderWithSupplier[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("purchase_orders")
    .select(`
      *,
      supplier:suppliers(id, name)
    `)
    .eq("organization_id", org.id)
    .eq("supplier_id", supplierId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Error fetching recent purchase orders: ${error.message}`);
  }

  if (!data) {
    return [];
  }

  return data.map((order: PurchaseOrderWithSupplierRaw) => {
    const supplier = order.supplier;
    const supplierData = Array.isArray(supplier) ? supplier[0] : supplier;

    const normalizedSupplier =
      supplierData &&
      typeof supplierData === "object" &&
      "id" in supplierData &&
      "name" in supplierData
        ? supplierData
        : {
            id: order.supplier_id,
            name: "Sin asignar",
          };

    return {
      ...order,
      supplier: normalizedSupplier,
    };
  }) as PurchaseOrderWithSupplier[];
}

/**
 * Gets purchase orders items by id
 */
export async function getPurchaseOrderItemById(itemId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("purchase_order_items")
    .select(
      "id, product_id, purchase_order_id, quantity, unit_quantity, unit_cost"
    )
    .eq("id", itemId)
    .single();
  if (error) {
    return null;
  }
  return data;
}

/**
 * Updates the status of a purchase order
 */
export async function updatePurchaseOrderStatus(
  orgSlug: string,
  purchaseOrderId: string,
  status: "ORDERED" | "IN_TRANSIT" | "RECEIVED" | "CANCELLED",
  options?: {
    delivery_date?: string;
    logistics?: string;
  }
): Promise<PurchaseOrder> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const updateData: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === "IN_TRANSIT" && options) {
    if (options.delivery_date) {
      updateData.delivery_date = options.delivery_date;
    }
    if (options.logistics) {
      updateData.logistics = options.logistics;
    }
  }

  const { data, error } = await supabase
    .from("purchase_orders")
    .update(updateData)
    .eq("id", purchaseOrderId)
    .eq("organization_id", org.id)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Error updating purchase order status: ${error.message}`);
  }

  if (!data) {
    throw new Error("Orden de compra no encontrada");
  }

  return data;
}

export type UpdateReceivedItemInput = {
  itemId: string;
  unitQuantity?: number;
  quantity?: number;
  unitCost?: number;
};

async function deleteNonReceivedPurchaseOrderItems(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  orgId: string;
  purchaseOrderId: string;
  receivedItemIds: string[];
}) {
  const { supabase, orgId, purchaseOrderId, receivedItemIds } = params;

  const { data: allItems } = await supabase
    .from("purchase_order_items")
    .select("id")
    .eq("purchase_order_id", purchaseOrderId)
    .eq("organization_id", orgId);

  if (!allItems) {
    return;
  }

  const allItemIds = allItems.map((item) => item.id);
  const itemsToDelete = allItemIds.filter(
    (id) => !receivedItemIds.includes(id)
  );

  if (itemsToDelete.length === 0) {
    return;
  }

  const { error: deleteError } = await supabase
    .from("purchase_order_items")
    .delete()
    .eq("purchase_order_id", purchaseOrderId)
    .eq("organization_id", orgId)
    .in("id", itemsToDelete);

  if (deleteError) {
    throw new Error(
      `Error deleting non-received items: ${deleteError.message}`
    );
  }
}

/**
 * Updates purchase order items with adjusted values during receipt
 */
export async function updateReceivedPurchaseOrderItems(
  orgSlug: string,
  purchaseOrderId: string,
  receivedItems: UpdateReceivedItemInput[]
): Promise<void> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const updatePromises = receivedItems.map(async (item) => {
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (item.unitQuantity !== undefined) {
      updateData.unit_quantity = item.unitQuantity;
    }
    if (item.quantity !== undefined) {
      updateData.quantity = item.quantity;
    }
    if (item.unitCost !== undefined) {
      updateData.unit_cost = item.unitCost;
    }

    // Subtotal is always unit_cost × unit_quantity (kg/lts/etc.)
    const { data: currentItem } = await supabase
      .from("purchase_order_items")
      .select("unit_quantity, unit_cost")
      .eq("id", item.itemId)
      .single();

    if (currentItem) {
      const cost = item.unitCost ?? currentItem.unit_cost ?? 0;
      const unitQty = item.unitQuantity ?? currentItem.unit_quantity ?? 0;
      updateData.subtotal = truncateMoney(unitQty * cost);
    }

    const { error } = await supabase
      .from("purchase_order_items")
      .update(updateData)
      .eq("id", item.itemId)
      .eq("purchase_order_id", purchaseOrderId);

    if (error) {
      throw new Error(`Error updating item: ${error.message}`);
    }
  });

  await Promise.all(updatePromises);

  // Recalculate purchase order totals
  const { data: updatedItems } = await supabase
    .from("purchase_order_items")
    .select("subtotal")
    .eq("purchase_order_id", purchaseOrderId);

  if (updatedItems) {
    const subtotal = updatedItems.reduce(
      (sum, item) => truncateMoney(sum + truncateMoney(item.subtotal ?? 0)),
      0
    );

    // Get global discount percentage
    const { data: purchaseOrder } = await supabase
      .from("purchase_orders")
      .select(
        "global_discount_percentage, supplier_id, expiration_date, purchase_date"
      )
      .eq("id", purchaseOrderId)
      .eq("organization_id", org.id)
      .single();

    const {
      global_discount_percentage,
      global_discount_amount,
      taxable_base_amount,
    } = calculateGlobalDiscount(
      subtotal,
      purchaseOrder?.global_discount_percentage ?? 0
    );

    // Get taxes to calculate totals
    const { data: taxes } = await supabase
      .from("purchase_order_taxes")
      .select("id, rate")
      .eq("purchase_order_id", purchaseOrderId);

    const tax_amount = taxes
      ? taxes.reduce(
          (sum, tax) =>
            truncateMoney(sum + taxable_base_amount * (tax.rate / 100)),
          0
        )
      : 0;

    const total_amount = truncateMoney(
      Math.max(0, taxable_base_amount + tax_amount)
    );
    const validatedTotals = validateRecalculatedTotals({
      subtotal,
      tax_amount,
      global_discount_percentage,
      global_discount_amount,
      total_amount,
    });

    if (taxes?.length) {
      await Promise.all(
        taxes.map((tax) =>
          supabase
            .from("purchase_order_taxes")
            .update({
              base_amount: taxable_base_amount,
              tax_amount: truncateMoney(taxable_base_amount * (tax.rate / 100)),
            })
            .eq("id", tax.id)
            .eq("purchase_order_id", purchaseOrderId)
            .eq("organization_id", org.id)
        )
      );
    }

    const { error: updateOrderError } = await supabase
      .from("purchase_orders")
      .update({
        subtotal_amount: validatedTotals.subtotal,
        tax_amount: validatedTotals.tax_amount,
        global_discount_percentage: validatedTotals.global_discount_percentage,
        global_discount_amount: validatedTotals.global_discount_amount,
        total_amount: validatedTotals.total_amount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", purchaseOrderId)
      .eq("organization_id", org.id);

    if (updateOrderError) {
      throw new Error(
        `Error updating purchase order totals: ${updateOrderError.message}`
      );
    }

    if (purchaseOrder) {
      await syncAccountsPayableAfterTotalRecalculation({
        supabase,
        orgId: org.id,
        supplierId: purchaseOrder.supplier_id,
        purchaseOrderId,
        purchaseDate: purchaseOrder.purchase_date,
        expirationDate: purchaseOrder.expiration_date,
        totalAmount: validatedTotals.total_amount,
      });
    }
  }
}

/**
 * Processes purchase receipt: updates received items, removes non-received items, and recalculates totals
 */
async function updateReceivedItem(
  supabase: Awaited<ReturnType<typeof createClient>>,
  item: UpdateReceivedItemInput,
  purchaseOrderId: string,
  orgId: string
): Promise<void> {
  const updateData: Record<string, unknown> = {};

  if (item.unitQuantity !== undefined) {
    updateData.unit_quantity = item.unitQuantity;
  }
  if (item.quantity !== undefined) {
    updateData.quantity = item.quantity;
  }
  if (item.unitCost !== undefined) {
    updateData.unit_cost = item.unitCost;
  }

  const { data: currentItem } = await supabase
    .from("purchase_order_items")
    .select("unit_quantity, quantity, unit_cost")
    .eq("id", item.itemId)
    .single();

  if (currentItem) {
    const cost = item.unitCost ?? currentItem.unit_cost ?? 0;
    const unitQty = item.unitQuantity ?? currentItem.unit_quantity ?? 0;
    const qty = item.quantity ?? currentItem.quantity ?? 0;
    updateData.subtotal = unitQty > 0 ? unitQty * cost : qty * cost;
  }

  const { error } = await supabase
    .from("purchase_order_items")
    .update(updateData)
    .eq("id", item.itemId)
    .eq("purchase_order_id", purchaseOrderId)
    .eq("organization_id", orgId);

  if (error) {
    throw new Error(`Error updating item: ${error.message}`);
  }
}

export async function processPurchaseReceipt(
  orgSlug: string,
  purchaseOrderId: string,
  receivedItemIds: string[],
  itemUpdates: UpdateReceivedItemInput[]
): Promise<void> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const updatePromises = itemUpdates.map((item) =>
    updateReceivedItem(supabase, item, purchaseOrderId, org.id)
  );

  await Promise.all(updatePromises);

  await deleteNonReceivedPurchaseOrderItems({
    supabase,
    orgId: org.id,
    purchaseOrderId,
    receivedItemIds,
  });

  // Recalculate purchase order totals
  const { data: remainingItems } = await supabase
    .from("purchase_order_items")
    .select("subtotal")
    .eq("purchase_order_id", purchaseOrderId)
    .eq("organization_id", org.id);

  if (remainingItems) {
    const subtotal = remainingItems.reduce(
      (sum, item) => truncateMoney(sum + truncateMoney(item.subtotal ?? 0)),
      0
    );

    // Get taxes to calculate tax_amount
    const { data: taxes } = await supabase
      .from("purchase_order_taxes")
      .select("id, rate")
      .eq("purchase_order_id", purchaseOrderId)
      .eq("organization_id", org.id);

    // Get current global discount percentage
    const { data: purchaseOrder } = await supabase
      .from("purchase_orders")
      .select(
        "global_discount_percentage, supplier_id, expiration_date, purchase_date"
      )
      .eq("id", purchaseOrderId)
      .eq("organization_id", org.id)
      .single();

    const {
      global_discount_percentage,
      global_discount_amount,
      taxable_base_amount,
    } = calculateGlobalDiscount(
      subtotal,
      purchaseOrder?.global_discount_percentage ?? 0
    );

    const tax_amount = taxes
      ? taxes.reduce(
          (sum, tax) =>
            truncateMoney(sum + taxable_base_amount * (tax.rate / 100)),
          0
        )
      : 0;

    if (taxes?.length) {
      await Promise.all(
        taxes.map((tax) =>
          supabase
            .from("purchase_order_taxes")
            .update({
              base_amount: taxable_base_amount,
              tax_amount: truncateMoney(taxable_base_amount * (tax.rate / 100)),
            })
            .eq("id", tax.id)
            .eq("purchase_order_id", purchaseOrderId)
            .eq("organization_id", org.id)
        )
      );
    }

    // Calculate total: base imponible neta + impuestos
    const total = truncateMoney(Math.max(0, taxable_base_amount + tax_amount));
    const validatedTotals = validateRecalculatedTotals({
      subtotal,
      tax_amount,
      global_discount_percentage,
      global_discount_amount,
      total_amount: total,
    });

    const { error: updateOrderError } = await supabase
      .from("purchase_orders")
      .update({
        subtotal_amount: validatedTotals.subtotal,
        tax_amount: validatedTotals.tax_amount,
        global_discount_percentage: validatedTotals.global_discount_percentage,
        global_discount_amount: validatedTotals.global_discount_amount,
        total_amount: validatedTotals.total_amount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", purchaseOrderId)
      .eq("organization_id", org.id);

    if (updateOrderError) {
      throw new Error(
        `Error updating purchase order totals: ${updateOrderError.message}`
      );
    }

    if (purchaseOrder) {
      await syncAccountsPayableAfterTotalRecalculation({
        supabase,
        orgId: org.id,
        supplierId: purchaseOrder.supplier_id,
        purchaseOrderId,
        purchaseDate: purchaseOrder.purchase_date,
        expirationDate: purchaseOrder.expiration_date,
        totalAmount: validatedTotals.total_amount,
      });
    }
  }
}

/**
 * Updates only the taxes for a purchase order and recalculates totals
 */
export async function updatePurchaseOrderTaxesOnly(
  orgSlug: string,
  purchaseOrderId: string,
  taxes: {
    tax_id: string;
    name: string;
    rate: number;
  }[]
): Promise<void> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  // Get current subtotal and global discount
  const { data: purchaseOrder } = await supabase
    .from("purchase_orders")
    .select("subtotal_amount, global_discount_percentage")
    .eq("id", purchaseOrderId)
    .eq("organization_id", org.id)
    .single();

  if (!purchaseOrder) {
    throw new Error("Orden de compra no encontrada");
  }

  const subtotal = truncateMoney(purchaseOrder.subtotal_amount ?? 0);
  const { global_discount_amount, taxable_base_amount } =
    calculateGlobalDiscount(
      subtotal,
      purchaseOrder.global_discount_percentage ?? 0
    );

  // Delete existing taxes
  await supabase
    .from("purchase_order_taxes")
    .delete()
    .eq("purchase_order_id", purchaseOrderId)
    .eq("organization_id", org.id);

  // Insert new taxes
  if (taxes.length > 0) {
    const taxesToInsert = taxes.map((tax) => ({
      organization_id: org.id,
      purchase_order_id: purchaseOrderId,
      tax_id: tax.tax_id,
      name: tax.name,
      rate: tax.rate,
      base_amount: taxable_base_amount,
      tax_amount: truncateMoney(taxable_base_amount * (tax.rate / 100)),
    }));

    const { error: taxesError } = await supabase
      .from("purchase_order_taxes")
      .insert(taxesToInsert);

    if (taxesError) {
      throw new Error(`Error updating taxes: ${taxesError.message}`);
    }
  }

  // Recalculate totals
  const tax_amount = taxes.reduce(
    (sum, tax) => truncateMoney(sum + taxable_base_amount * (tax.rate / 100)),
    0
  );
  const total = truncateMoney(Math.max(0, taxable_base_amount + tax_amount));

  const { data: updatedPurchaseOrder } = await supabase
    .from("purchase_orders")
    .update({
      tax_amount,
      global_discount_amount,
      total_amount: total,
      updated_at: new Date().toISOString(),
    })
    .eq("id", purchaseOrderId)
    .eq("organization_id", org.id)
    .select("purchase_date, supplier_id")
    .single();

  if (!updatedPurchaseOrder) {
    throw new Error("No se pudo actualizar la orden de compra");
  }

  // Sync the updated total to accounts_payable
  if (updatedPurchaseOrder.supplier_id) {
    await syncAccountsPayable({
      supabase,
      orgId: org.id,
      supplierId: updatedPurchaseOrder.supplier_id,
      purchaseOrderId,
      totalAmount: total,
      dueDate: updatedPurchaseOrder.purchase_date,
    });
  }
}

export type UpdatePurchaseOrderInput = {
  orgSlug: string;
  purchaseOrderId: string;
  supplier_id?: string;
  purchase_date?: string;
  expiration_date?: string | null;
  remittance_number?: string | null;
  items?: {
    id?: string;
    product_id: string;
    quantity: number;
    unit_quantity: number;
    unit_cost: number;
    subtotal: number;
    variant_stocks?: Record<string, Record<string, number>> | null;
  }[];
  taxes?: {
    tax_id: string;
    name: string;
    rate: number;
  }[];
  global_discount_percentage?: number;
};

/**
 * Builds update data object for purchase order fields
 */
function buildPurchaseOrderUpdateData(
  input: UpdatePurchaseOrderInput
): Record<string, unknown> {
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.supplier_id) {
    updateData.supplier_id = input.supplier_id;
  }
  if (input.purchase_date) {
    updateData.purchase_date = input.purchase_date;
  }
  if (input.expiration_date !== undefined) {
    updateData.expiration_date = input.expiration_date;
  }
  if (input.remittance_number !== undefined) {
    updateData.remittance_number = input.remittance_number;
  }

  return updateData;
}

/**
 * Calculates and adds totals to update data if items are provided
 */
function calculateAndAddTotals(
  updateData: Record<string, unknown>,
  items: UpdatePurchaseOrderInput["items"],
  taxes: UpdatePurchaseOrderInput["taxes"],
  globalDiscountPercentage?: number
): void {
  if (!items || items.length === 0) {
    return;
  }

  const subtotal_amount = items.reduce(
    (sum, item) =>
      truncateMoney(
        sum + truncateMoney(item.subtotal ?? item.quantity * item.unit_cost)
      ),
    0
  );

  const {
    global_discount_percentage,
    global_discount_amount,
    taxable_base_amount,
  } = calculateGlobalDiscount(subtotal_amount, globalDiscountPercentage ?? 0);
  const { total_tax_amount } = calculateTaxAmounts(
    taxes as PurchaseTaxInput[] | undefined,
    taxable_base_amount
  );

  const total_amount = truncateMoney(
    Math.max(0, taxable_base_amount + total_tax_amount)
  );

  updateData.subtotal_amount = subtotal_amount;
  updateData.tax_amount = total_tax_amount;
  updateData.global_discount_percentage = global_discount_percentage;
  updateData.global_discount_amount = global_discount_amount;
  updateData.total_amount = total_amount;
}

/**
 * Updates purchase order items in the database
 */
async function updatePurchaseOrderItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  purchaseOrderId: string,
  items: UpdatePurchaseOrderInput["items"]
): Promise<void> {
  if (!items) {
    return;
  }

  await supabase
    .from("purchase_order_items")
    .delete()
    .eq("purchase_order_id", purchaseOrderId)
    .eq("organization_id", orgId);

  const itemsToInsert = items.map((item) => ({
    organization_id: orgId,
    purchase_order_id: purchaseOrderId,
    product_id: item.product_id,
    quantity: Math.max(1, item.quantity),
    unit_quantity: item.unit_quantity,
    unit_cost: truncateMoney(item.unit_cost),
    subtotal: truncateMoney(item.subtotal),
    variant_stocks: item.variant_stocks ?? null,
  }));

  const { error: itemsError } = await supabase
    .from("purchase_order_items")
    .insert(itemsToInsert);

  if (itemsError) {
    throw new Error(
      `Error updating purchase order items: ${itemsError.message}`
    );
  }
}

/**
 * Updates purchase order taxes in the database
 */
async function updatePurchaseOrderTaxes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  options: {
    orgId: string;
    purchaseOrderId: string;
    taxes: UpdatePurchaseOrderInput["taxes"];
    taxableBaseAmount: number;
  }
): Promise<void> {
  if (options.taxes === undefined) {
    return;
  }

  await supabase
    .from("purchase_order_taxes")
    .delete()
    .eq("purchase_order_id", options.purchaseOrderId)
    .eq("organization_id", options.orgId);

  if (options.taxes.length === 0) {
    return;
  }

  const taxesToInsert = options.taxes.map((tax) => ({
    organization_id: options.orgId,
    purchase_order_id: options.purchaseOrderId,
    tax_id: tax.tax_id,
    name: tax.name,
    rate: tax.rate,
    base_amount: truncateMoney(options.taxableBaseAmount),
    tax_amount: truncateMoney(options.taxableBaseAmount * (tax.rate / 100)),
  }));

  const { error: taxesError } = await supabase
    .from("purchase_order_taxes")
    .insert(taxesToInsert);

  if (taxesError) {
    throw new Error(
      `Error updating purchase order taxes: ${taxesError.message}`
    );
  }
}

/**
 * Updates a purchase order with its items
 */
export async function updatePurchaseOrder(
  input: UpdatePurchaseOrderInput
): Promise<PurchaseOrder> {
  const org = await getOrganizationBySlug(input.orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const updateData = buildPurchaseOrderUpdateData(input);
  calculateAndAddTotals(
    updateData,
    input.items,
    input.taxes,
    input.global_discount_percentage
  );

  const { data: purchaseOrder, error: orderError } = await supabase
    .from("purchase_orders")
    .update(updateData)
    .eq("id", input.purchaseOrderId)
    .eq("organization_id", org.id)
    .select("*")
    .single();

  if (orderError || !purchaseOrder) {
    throw new Error(
      `Error updating purchase order: ${orderError?.message || "Not found"}`
    );
  }

  await updatePurchaseOrderItems(
    supabase,
    org.id,
    input.purchaseOrderId,
    input.items
  );

  const subtotalAmount = truncateMoney(
    (updateData.subtotal_amount as number) ?? purchaseOrder.subtotal_amount ?? 0
  );
  const globalDiscountAmount = truncateMoney(
    (updateData.global_discount_amount as number) ??
      purchaseOrder.global_discount_amount ??
      0
  );
  const taxableBaseAmount = truncateMoney(
    Math.max(0, subtotalAmount - globalDiscountAmount)
  );
  await updatePurchaseOrderTaxes(supabase, {
    orgId: org.id,
    purchaseOrderId: input.purchaseOrderId,
    taxes: input.taxes,
    taxableBaseAmount,
  });

  // Only use expiration_date if provided, otherwise null
  const payableDueDate =
    input.expiration_date ?? purchaseOrder.expiration_date ?? null;
  const payableTotal = truncateMoney(
    (updateData.total_amount as number) ?? purchaseOrder.total_amount ?? 0
  );

  if (payableDueDate && purchaseOrder.supplier_id) {
    await syncAccountsPayable({
      supabase,
      orgId: org.id,
      supplierId: purchaseOrder.supplier_id,
      purchaseOrderId: input.purchaseOrderId,
      totalAmount: payableTotal,
      dueDate: payableDueDate,
    });
  }

  return purchaseOrder;
}

/**
 * Gets a purchase order with all its items
 */
export async function getPurchaseOrderWithItems(
  orgSlug: string,
  purchaseOrderId: string
): Promise<
  PurchaseOrder & {
    items: (PurchaseOrderItem & {
      product_name?: string;
      unit_of_measure?: string | null;
      weight_per_unit?: number | null;
      has_variants?: boolean;
    })[];
    taxes: Array<{
      tax_id: string;
      name: string;
      rate: number;
    }> | null;
  }
> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data: order, error: orderError } = await supabase
    .from("purchase_orders")
    .select("*")
    .eq("id", purchaseOrderId)
    .eq("organization_id", org.id)
    .single();

  if (orderError || !order) {
    throw new Error(
      `Error fetching purchase order: ${orderError?.message || "Not found"}`
    );
  }

  const { data: items, error: itemsError } = await supabase
    .from("purchase_order_items")
    .select(`
      *,
      product:products(id, name, sku, weight_per_unit, unit_of_measure, has_variants)
    `)
    .eq("purchase_order_id", purchaseOrderId)
    .eq("organization_id", org.id);

  if (itemsError) {
    throw new Error(
      `Error fetching purchase order items: ${itemsError.message}`
    );
  }

  const { data: taxes, error: taxesError } = await supabase
    .from("purchase_order_taxes")
    .select("tax_id, name, rate")
    .eq("purchase_order_id", purchaseOrderId)
    .eq("organization_id", org.id);

  if (taxesError) {
    throw new Error(
      `Error fetching purchase order taxes: ${taxesError.message}`
    );
  }

  return {
    ...order,
    taxes: taxes || null,
    items: (items || []).map(
      (
        item: PurchaseOrderItem & {
          product?: {
            id: string;
            name: string;
            sku: string;
            weight_per_unit?: number | null;
            unit_of_measure?: string | null;
            has_variants?: boolean | null;
          } | null;
        }
      ) => ({
        ...item,
        product_name: item.product?.name || item.product_id,
        weight_per_unit: item.product?.weight_per_unit ?? null,
        unit_of_measure: item.product?.unit_of_measure ?? null,
        has_variants: item.product?.has_variants ?? false,
      })
    ),
  };
}

// Helper functions for processBulkSupplierPayment
function calculateSupplierPaymentDistributions(
  pendingAccounts: Array<{
    id: string;
    total_amount: number;
    pending_balance: number;
    due_date: string;
    purchase?: {
      purchase_number?: number | null;
    } | null;
  }>,
  totalAmount: number
) {
  let remainingAmount = truncateMoney(totalAmount);
  const distributions: Array<{
    accountId: string;
    purchaseNumber: number | null;
    dueDate: string;
    totalAmount: number;
    pendingBalance: number;
    appliedAmount: number;
    newBalance: number;
    newStatus: CollectionAccountStatus;
  }> = [];
  const accountsToUpdate: Array<{
    id: string;
    newBalance: number;
    newStatus: CollectionAccountStatus;
  }> = [];
  const paymentsToInsert: Array<{
    account_payable_id: string;
    amount: number;
  }> = [];

  for (const account of pendingAccounts) {
    if (remainingAmount <= 0) {
      break;
    }

    const pendingBalance = truncateMoney(Number(account.pending_balance ?? 0));
    const totalAccountAmount = truncateMoney(Number(account.total_amount ?? 0));
    const appliedAmount = truncateMoney(
      Math.min(remainingAmount, pendingBalance)
    );
    const newBalance = truncateMoney(
      Math.max(0, pendingBalance - appliedAmount)
    );
    const newStatus = derivePayableStatus(totalAccountAmount, newBalance);

    const purchase = Array.isArray(account.purchase)
      ? account.purchase[0]
      : account.purchase;

    distributions.push({
      accountId: account.id,
      purchaseNumber: purchase?.purchase_number ?? null,
      dueDate: account.due_date,
      totalAmount: totalAccountAmount,
      pendingBalance,
      appliedAmount,
      newBalance,
      newStatus,
    });

    accountsToUpdate.push({
      id: account.id,
      newBalance,
      newStatus,
    });

    paymentsToInsert.push({
      account_payable_id: account.id,
      amount: appliedAmount,
    });

    remainingAmount = truncateMoney(remainingAmount - appliedAmount);
  }

  return {
    distributions,
    accountsToUpdate,
    paymentsToInsert,
    appliedAmount: truncateMoney(totalAmount - remainingAmount),
    creditBalance: truncateMoney(remainingAmount),
  };
}

function insertBulkSupplierPayments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: {
    orgId: string;
    paymentsToInsert: Array<{ account_payable_id: string; amount: number }>;
    paymentMethodValue: Database["public"]["Enums"]["payment_method_type"];
    paymentDateValue: string;
    sanitizedReference: string | null;
    sanitizedNotes: string | null;
  }
) {
  const {
    orgId,
    paymentsToInsert,
    paymentMethodValue,
    paymentDateValue,
    sanitizedReference,
    sanitizedNotes,
  } = params;

  return supabase.from("payable_payments").insert(
    paymentsToInsert.map((p) => ({
      organization_id: orgId,
      account_payable_id: p.account_payable_id,
      amount: truncateMoney(p.amount),
      payment_method: paymentMethodValue,
      payment_date: paymentDateValue,
      reference_number: sanitizedReference,
      notes: sanitizedNotes,
    }))
  );
}

async function updatePayablesStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  accountsToUpdate: Array<{
    id: string;
    newBalance: number;
    newStatus: CollectionAccountStatus;
  }>
) {
  for (const update of accountsToUpdate) {
    let statusValue = "PENDING";
    if (update.newStatus === "PAID") {
      statusValue = "PAID";
    } else if (update.newStatus === "PARTIAL") {
      statusValue = "PARTIALLY_PAID";
    }

    const { error } = await supabase
      .from("accounts_payable")
      .update({
        pending_balance: truncateMoney(update.newBalance),
        status: statusValue,
      })
      .eq("id", update.id)
      .eq("organization_id", orgId);

    if (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Error al actualizar saldos: ${message}`);
    }
  }
}

async function rollbackBulkSupplierPayments(options: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  orgId: string;
  paymentsToInsert: Array<{ account_payable_id: string; amount: number }>;
  paymentDateValue: string;
  paymentMethodValue: Database["public"]["Enums"]["payment_method_type"];
}) {
  const {
    supabase,
    orgId,
    paymentsToInsert,
    paymentDateValue,
    paymentMethodValue,
  } = options;

  await supabase
    .from("payable_payments")
    .delete()
    .eq("organization_id", orgId)
    .in(
      "account_payable_id",
      paymentsToInsert.map((p) => p.account_payable_id)
    )
    .eq("payment_date", paymentDateValue)
    .eq("payment_method", paymentMethodValue);
}

/**
 * Process bulk supplier payment (FIFO distribution)
 */
export async function processBulkSupplierPayment(input: {
  orgSlug: string;
  supplierId: string;
  totalAmount: number;
  paymentMethod: string;
  paymentDate?: string;
  referenceNumber?: string;
  notes?: string;
}): Promise<{
  success: boolean;
  error?: string;
  code?: string;
  appliedAmount?: number;
  creditBalance?: number;
  affectedAccounts?: number;
  distributions?: Array<{
    accountId: string;
    purchaseNumber: number | null;
    dueDate: string;
    totalAmount: number;
    pendingBalance: number;
    appliedAmount: number;
    newBalance: number;
    newStatus: CollectionAccountStatus;
  }>;
}> {
  const {
    orgSlug,
    supplierId,
    totalAmount,
    paymentMethod,
    paymentDate,
    referenceNumber,
    notes,
  } = input;

  const normalizedTotalAmount = truncateMoney(totalAmount);

  if (normalizedTotalAmount <= 0) {
    return {
      success: false,
      error: "El monto debe ser mayor a cero",
      code: "invalid_amount",
    };
  }

  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return {
      success: false,
      error: "Organización no encontrada",
      code: "organization_not_found",
    };
  }

  const supabase = await createClient();

  // Get pending payables for supplier, ordered by due date (FIFO)
  const { data: pendingAccounts, error: fetchError } = await supabase
    .from("accounts_payable")
    .select(`
      id,
      purchase_order_id,
      total_amount,
      pending_balance,
      due_date,
      purchase:purchase_orders(purchase_number)
    `)
    .eq("organization_id", org.id)
    .eq("supplier_id", supplierId)
    .in("status", ["PENDING", "PARTIALLY_PAID"])
    .gt("pending_balance", 0)
    .order("due_date", { ascending: true });

  if (fetchError) {
    return {
      success: false,
      error: `Error al obtener cuentas pendientes: ${fetchError.message}`,
    };
  }

  if (!pendingAccounts || pendingAccounts.length === 0) {
    return {
      success: false,
      error: "No hay cuentas pendientes para este proveedor",
      code: "no_pending_accounts",
    };
  }

  // Calculate distribution (FIFO)
  const {
    distributions,
    accountsToUpdate,
    paymentsToInsert,
    appliedAmount,
    creditBalance,
  } = calculateSupplierPaymentDistributions(
    pendingAccounts,
    normalizedTotalAmount
  );

  // Payment method mapping
  const paymentMethodMap: Record<
    string,
    Database["public"]["Enums"]["payment_method_type"]
  > = {
    efectivo: "efectivo",
    transferencia: "transferencia",
    cheque: "cheque",
    tarjeta_de_credito: "tarjeta de credito",
    tarjeta_de_debito: "tarjeta de debito",
  };

  const paymentMethodValue = paymentMethodMap[paymentMethod] ?? "efectivo";
  const paymentDateValue =
    paymentDate ?? new Date().toISOString().split("T")[0];
  const sanitizedReference = referenceNumber?.trim() || null;
  const sanitizedNotes = notes?.trim() || null;

  // Insert payments
  const { error: paymentsError } = await insertBulkSupplierPayments(supabase, {
    orgId: org.id,
    paymentsToInsert,
    paymentMethodValue,
    paymentDateValue,
    sanitizedReference,
    sanitizedNotes,
  });

  if (paymentsError) {
    return {
      success: false,
      error: `Error al registrar pagos: ${paymentsError.message}`,
    };
  }

  // Update payables status
  try {
    await updatePayablesStatus(supabase, org.id, accountsToUpdate);
  } catch (error) {
    // Rollback: delete all inserted payments
    await rollbackBulkSupplierPayments({
      supabase,
      orgId: org.id,
      paymentsToInsert,
      paymentDateValue,
      paymentMethodValue,
    });

    const errorMessage =
      error instanceof Error ? error.message : "Error desconocido";
    return {
      success: false,
      error: `Error al actualizar saldos: ${errorMessage}`,
    };
  }

  // Save credit balance if there's surplus
  if (creditBalance > 0) {
    await saveSupplierCredit({
      supabase,
      orgId: org.id,
      supplierId,
      creditBalance,
      notes: sanitizedNotes,
    });
  }

  return {
    success: true,
    appliedAmount,
    creditBalance,
    affectedAccounts: distributions.length,
    distributions,
  };
}

async function saveSupplierCredit(options: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  orgId: string;
  supplierId: string;
  creditBalance: number;
  notes: string | null;
}) {
  const { supabase, orgId, supplierId, creditBalance, notes } = options;

  const creditNotes = notes
    ? `Crédito generado por pago masivo. ${notes}`
    : "Crédito generado por pago masivo";

  const { error } = await supabase.from("supplier_credits" as never).insert({
    organization_id: orgId,
    supplier_id: supplierId,
    amount: truncateMoney(creditBalance),
    remaining_amount: truncateMoney(creditBalance),
    source_payment_id: null,
    notes: creditNotes,
  } as never);

  if (error) {
    console.error("Error al guardar crédito con proveedor:", error);
  }
}

/**
 * Calculate bulk supplier payment distribution (preview)
 */
export async function calculateBulkSupplierPaymentDistribution(
  orgSlug: string,
  supplierId: string,
  totalAmount: number
): Promise<
  Array<{
    accountId: string;
    purchaseNumber: number | null;
    dueDate: string;
    totalAmount: number;
    pendingBalance: number;
    appliedAmount: number;
    newBalance: number;
    newStatus: CollectionAccountStatus;
  }>
> {
  const normalizedTotalAmount = truncateMoney(totalAmount);

  if (normalizedTotalAmount <= 0) {
    return [];
  }

  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data: pendingAccounts, error } = await supabase
    .from("accounts_payable")
    .select(`
      id,
      purchase_order_id,
      total_amount,
      pending_balance,
      due_date,
      purchase:purchase_orders(purchase_number)
    `)
    .eq("organization_id", org.id)
    .eq("supplier_id", supplierId)
    .in("status", ["PENDING", "PARTIALLY_PAID"])
    .gt("pending_balance", 0)
    .order("due_date", { ascending: true });

  if (error) {
    throw new Error(`Error al obtener cuentas: ${error.message}`);
  }

  if (!pendingAccounts || pendingAccounts.length === 0) {
    return [];
  }

  let remainingAmount = normalizedTotalAmount;
  const distributions: Array<{
    accountId: string;
    purchaseNumber: number | null;
    dueDate: string;
    totalAmount: number;
    pendingBalance: number;
    appliedAmount: number;
    newBalance: number;
    newStatus: CollectionAccountStatus;
  }> = [];

  for (const account of pendingAccounts) {
    if (remainingAmount <= 0) {
      break;
    }

    const pendingBalance = truncateMoney(Number(account.pending_balance ?? 0));
    const totalAccountAmount = truncateMoney(Number(account.total_amount ?? 0));
    const appliedAmount = truncateMoney(
      Math.min(remainingAmount, pendingBalance)
    );
    const newBalance = truncateMoney(
      Math.max(0, pendingBalance - appliedAmount)
    );
    const newStatus = derivePayableStatus(totalAccountAmount, newBalance);

    const purchase = Array.isArray(account.purchase)
      ? account.purchase[0]
      : account.purchase;

    distributions.push({
      accountId: account.id,
      purchaseNumber: purchase?.purchase_number ?? null,
      dueDate: account.due_date,
      totalAmount: totalAccountAmount,
      pendingBalance,
      appliedAmount,
      newBalance,
      newStatus,
    });

    remainingAmount = truncateMoney(remainingAmount - appliedAmount);
  }

  return distributions;
}

/**
 * Get available supplier credits for a supplier
 */
export async function getSupplierCredits(
  orgSlug: string,
  supplierId: string
): Promise<
  Array<{
    id: string;
    amount: number;
    remaining_amount: number;
    notes: string | null;
    created_at: string;
  }>
> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return [];
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("supplier_credits" as never)
    .select("id, amount, remaining_amount, notes, created_at")
    .eq("organization_id", org.id)
    .eq("supplier_id", supplierId)
    .gt("remaining_amount", 0)
    .order("created_at", { ascending: true });

  if (error || !data) {
    console.error("Error fetching supplier credits:", error);
    return [];
  }

  return (
    data as Array<{
      id: string;
      amount: number;
      remaining_amount: number;
      notes: string | null;
      created_at: string;
    }>
  ).map((credit) => ({
    ...credit,
    amount: truncateMoney(credit.amount),
    remaining_amount: truncateMoney(credit.remaining_amount),
  }));
}

/**
 * Get total available credit balance for a supplier
 */
export async function getSupplierCreditBalance(
  orgSlug: string,
  supplierId: string
): Promise<number> {
  const credits = await getSupplierCredits(orgSlug, supplierId);
  return credits.reduce(
    (sum, credit) =>
      truncateMoney(sum + truncateMoney(credit.remaining_amount)),
    0
  );
}

/**
 * Apply supplier credit to a purchase
 */
export async function applySupplierCreditToPurchase(
  orgSlug: string,
  supplierId: string,
  accountPayableId: string,
  amount: number
): Promise<{ success: boolean; error?: string }> {
  const normalizedAmount = truncateMoney(amount);

  if (normalizedAmount <= 0) {
    return { success: false, error: "El monto debe ser mayor a cero" };
  }

  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return { success: false, error: "Organización no encontrada" };
  }

  const supabase = await createClient();

  // Get available credits (FIFO - oldest first)
  const credits = await getSupplierCredits(orgSlug, supplierId);

  if (credits.length === 0) {
    return { success: false, error: "No hay créditos disponibles" };
  }

  const totalAvailable = credits.reduce(
    (sum, c) => truncateMoney(sum + truncateMoney(c.remaining_amount)),
    0
  );

  if (totalAvailable < normalizedAmount) {
    return {
      success: false,
      error: `Crédito insuficiente. Disponible: $${truncateMoney(totalAvailable).toFixed(2)}`,
    };
  }

  // Get account payable
  const { data: accountPayable, error: fetchError } = await supabase
    .from("accounts_payable")
    .select("id, pending_balance, total_amount")
    .eq("id", accountPayableId)
    .eq("organization_id", org.id)
    .eq("supplier_id", supplierId)
    .single();

  if (fetchError || !accountPayable) {
    return { success: false, error: "Cuenta por pagar no encontrada" };
  }

  // Apply credits (FIFO)
  let remainingToApply = normalizedAmount;

  for (const credit of credits) {
    if (remainingToApply <= 0) {
      break;
    }

    const amountToUse = truncateMoney(
      Math.min(remainingToApply, truncateMoney(credit.remaining_amount))
    );
    const newRemaining = truncateMoney(credit.remaining_amount - amountToUse);

    // Update credit
    const { error: updateCreditError } = await supabase
      // biome-ignore lint/suspicious/noExplicitAny: supplier_credits no está en tipos generados
      .from("supplier_credits" as any)
      .update({
        remaining_amount: newRemaining,
        updated_at: new Date().toISOString(),
      })
      .eq("id", credit.id)
      .eq("organization_id", org.id);

    if (updateCreditError) {
      console.error("Error updating supplier credit:", updateCreditError);
      return {
        success: false,
        error: "Error al aplicar crédito",
      };
    }

    remainingToApply = truncateMoney(remainingToApply - amountToUse);
  }

  // Update account payable
  const newPendingBalance = Math.max(
    0,
    truncateMoney(accountPayable.pending_balance) - normalizedAmount
  );
  const normalizedPendingBalance = truncateMoney(newPendingBalance);
  const newStatus = derivePayableStatus(
    truncateMoney(accountPayable.total_amount),
    normalizedPendingBalance
  );

  let statusValue = "PENDING";
  if (newStatus === "PAID") {
    statusValue = "PAID";
  } else if (newStatus === "PARTIAL") {
    statusValue = "PARTIALLY_PAID";
  }

  const { error: updatePayableError } = await supabase
    .from("accounts_payable")
    .update({
      pending_balance: normalizedPendingBalance,
      status: statusValue,
    })
    .eq("id", accountPayableId)
    .eq("organization_id", org.id);

  if (updatePayableError) {
    return {
      success: false,
      error: "Error al actualizar cuenta por pagar",
    };
  }

  return { success: true };
}

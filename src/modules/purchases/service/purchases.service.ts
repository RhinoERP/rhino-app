import { truncateMoney } from "@/lib/decimal";
import { createClient } from "@/lib/supabase/server";
import { getCategoryAccountingRules } from "@/modules/categories/service/categories.service";
import type { CollectionAccountStatus } from "@/modules/collections/types";
import { resolvePaymentCurrencyFields } from "@/modules/collections/utils/payment-currency";
import {
  NO_PAYABLE_INVOICE_RATE_MESSAGE,
  resolvePayableExchangeRate,
} from "@/modules/collections/utils/payment-rate";
import { createOrderNotifications } from "@/modules/notifications/service/notifications.service";
import { recalcParentOrderStatus } from "@/modules/orders/service/orders.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { ItemTaxInput } from "@/modules/taxes/item-tax-calculations";
import type { Database } from "@/types/supabase";
import type {
  PaginatedResult,
  PaginationParams,
  PurchaseMetrics,
} from "../types";
import { legacyPurchaseFiscalFieldsChanged } from "../utils/purchase-legacy";
import {
  buildPurchaseTaxPlan,
  getPurchaseItemTaxRows,
  parsePurchaseTaxInputs,
  persistPurchaseFiscalState,
  resolvePurchaseTaxSelections,
  toPurchaseItemTaxInput,
  tryParsePurchaseTaxInputs,
} from "./purchase-tax-snapshots.service";
import { applyFilters } from "./purchases-filters";

type AccessContext = {
  scope: "all" | "own";
  userId: string | null;
};

function canViewAll(permissions: string[]): boolean {
  return (
    permissions.includes("organization.admin") ||
    permissions.includes("purchases.read.all") ||
    permissions.includes("purchases.manage.all")
  );
}

async function resolveAccessContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgSlug: string
): Promise<AccessContext> {
  const [{ data: authData }, permissionsResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("get_user_org_permissions_by_slug", {
      target_org_slug: orgSlug,
    }),
  ]);

  const permissions = permissionsResult.error
    ? []
    : ((permissionsResult.data ?? []) as string[]);

  return {
    scope: canViewAll(permissions) ? "all" : "own",
    userId: authData.user?.id ?? null,
  };
}

export type PurchasePayableOrigin = "PURCHASE_NOTE" | "SUPPLIER_INVOICE";

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

type PurchaseTaxInput = Array<{
  taxId: string;
  name: string;
  rate: number;
}>;

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

  const { data: purchaseOrderData } = await supabase
    .from("purchase_orders")
    .select("currency, payable_origin")
    .eq("id", purchaseOrderId)
    .maybeSingle();
  const purchaseOrderRow = purchaseOrderData as {
    currency?: string | null;
    payable_origin?: PurchasePayableOrigin | null;
  } | null;

  // Once a supplier invoice exists, it is the sole authority for the debt.
  // OC edits must keep affecting stock and pricing, never its payable balance.
  if (purchaseOrderRow?.payable_origin === "SUPPLIER_INVOICE") {
    return;
  }

  const currency = purchaseOrderRow?.currency ?? "ARS";

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
      currency,
      due_date: dueDate,
      status: "PENDING",
    });

  if (insertError) {
    throw new Error(
      `No se pudo crear la cuenta por pagar: ${insertError.message}`
    );
  }
}

export type CreatePurchaseOrderInput = {
  orgSlug: string;
  supplier_id: string;
  purchase_date: string;
  expiration_date?: string;
  remittance_number?: string;
  currency?: string;
  payable_origin?: PurchasePayableOrigin;
  items: {
    product_id: string;
    quantity: number;
    unit_quantity: number;
    unit_cost: number;
    subtotal: number;
    unit_of_measure?: string | null;
    variant_stocks?: Record<string, Record<string, number>>;
    taxes?: ItemTaxInput[];
  }[];
  taxes?: PurchaseTaxInput;
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
/**
 * Rolls back a failed purchase order creation
 */
async function rollbackPurchaseOrder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  purchaseOrderId: string
): Promise<void> {
  await supabase
    .from("purchase_order_item_taxes")
    .delete()
    .eq("purchase_order_id", purchaseOrderId)
    .eq("organization_id", orgId);
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
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: resolves fiscal selections and persists the order before syncing its payable.
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

  const { global_discount_percentage, global_discount_amount } =
    calculateGlobalDiscount(
      subtotal_amount,
      input.global_discount_percentage ?? 0
    );

  const selections = await resolvePurchaseTaxSelections({
    supabase,
    orgId: org.id,
    lines: input.items,
    fallbackTaxes: input.taxes ?? [],
  });
  const fallbackTaxes = selections.fallbackTaxes;
  const resolvedItems = input.items.map((item, index) => ({
    ...item,
    taxes: selections.lineTaxes[index],
  }));
  const taxPlan = await buildPurchaseTaxPlan({
    supabase,
    orgId: org.id,
    lines: resolvedItems.map((item, index) => ({
      id: `item-${index}`,
      product_id: item.product_id,
      subtotal: item.subtotal,
      taxes: item.taxes,
    })),
    globalDiscountAmount: global_discount_amount,
    fallbackTaxes,
  });

  const total_tax_amount = taxPlan.totalTaxAmount;

  const total_amount = truncateMoney(
    Math.max(
      0,
      truncateMoney(subtotal_amount - global_discount_amount) + total_tax_amount
    )
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
      currency: input.currency ?? "ARS",
      subtotal_amount,
      tax_amount: total_tax_amount,
      global_discount_percentage,
      global_discount_amount,
      total_amount,
      status: "ORDERED",
      payable_origin: input.payable_origin ?? "PURCHASE_NOTE",
      fallback_taxes: fallbackTaxes ?? [],
      tax_snapshot_initialized: true,
    })
    .select("*")
    .single();

  if (orderError || !purchaseOrder) {
    throw new Error(`Error creating purchase order: ${orderError?.message}`);
  }

  try {
    const storedItems = resolvedItems.map((item) => ({
      id: crypto.randomUUID(),
      product_id: item.product_id,
      quantity: Math.max(
        ["KG", "LT", "MT"].includes(item.unit_of_measure ?? "") ? 0 : 1,
        item.quantity
      ),
      unit_quantity: item.unit_quantity,
      unit_cost: truncateMoney(item.unit_cost),
      subtotal: truncateMoney(item.subtotal),
      variant_stocks: item.variant_stocks ?? null,
      tax_override: item.taxes ?? null,
    }));
    const idByLine = new Map(
      storedItems.map((item, index) => [`item-${index}`, item.id])
    );
    await persistPurchaseFiscalState({
      supabase,
      mode: "replace",
      items: storedItems,
      orgId: org.id,
      orderId: purchaseOrder.id,
      plan: {
        ...taxPlan,
        itemTaxes: taxPlan.itemTaxes.map((tax) => ({
          ...tax,
          lineId: idByLine.get(tax.lineId) ?? tax.lineId,
        })),
      },
      subtotal: subtotal_amount,
      discountPercentage: global_discount_percentage,
      discountAmount: global_discount_amount,
      fallbackTaxes,
      supplierId: input.supplier_id,
      purchaseDate: input.purchase_date,
      expirationDate: input.expiration_date ?? null,
      payableDueDate: input.expiration_date ?? null,
      remittanceNumber: input.remittance_number ?? null,
    });
  } catch (error) {
    await rollbackPurchaseOrder(supabase, org.id, purchaseOrder.id);
    throw error instanceof Error
      ? error
      : new Error("No se pudo crear la cuenta por pagar");
  }

  return purchaseOrder;
}

export async function advanceLinkedChildOrderToGoodsReceived(
  purchaseOrderId: string,
  orgId: string,
  orgSlug: string
): Promise<void> {
  const supabase = await createClient();

  const { data: linkedOrder } = await supabase
    .from("orders")
    .select("id, status, parent_order_id, order_number")
    .eq("purchase_order_id", purchaseOrderId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!linkedOrder || linkedOrder.status !== "PURCHASING") {
    return;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return;
  }

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

  const changedByName =
    (user.user_metadata?.full_name as string | undefined) ??
    user.email ??
    "Usuario";

  createOrderNotifications({
    orgSlug,
    orgId,
    orderId: linkedOrder.id,
    orderNumber: linkedOrder.order_number,
    status: "GOODS_RECEIVED",
    isChild: true,
    changedByUserId: user.id,
    changedByName,
  }).catch(console.error);
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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: prepares frozen line taxes and final costs before one atomic confirmation.
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

  const { subtotalAmount } = computeDraftTotals(updatedItems);
  const { data: supplier } = await supabase
    .from("suppliers")
    .select("id")
    .eq("id", params.supplierId)
    .eq("organization_id", org.id)
    .single();
  if (!supplier) {
    throw new Error("El proveedor no pertenece a la organización");
  }
  const snapshots = await getPurchaseItemTaxRows(
    supabase,
    org.id,
    params.purchaseOrderId
  );
  const savedByItem = new Map<string, ItemTaxInput[]>();
  for (const tax of snapshots) {
    if (tax.source === "fallback" || tax.source === "legacy_prorated") {
      continue;
    }
    savedByItem.set(tax.purchase_order_item_id, [
      ...(savedByItem.get(tax.purchase_order_item_id) ?? []),
      toPurchaseItemTaxInput(tax),
    ]);
  }
  const fallbackTaxes = parsePurchaseTaxInputs(purchaseOrder.fallback_taxes);
  const { global_discount_percentage, global_discount_amount } =
    calculateGlobalDiscount(
      subtotalAmount,
      purchaseOrder.global_discount_percentage ?? 0
    );
  const plan = await buildPurchaseTaxPlan({
    supabase,
    orgId: org.id,
    lines: updatedItems.map((item) => ({
      id: item.id,
      product_id: item.product_id,
      subtotal: item.subtotal,
      taxes:
        item.tax_override === null
          ? (savedByItem.get(item.id) ??
            (purchaseOrder.tax_snapshot_initialized ? [] : undefined))
          : parsePurchaseTaxInputs(item.tax_override),
    })),
    globalDiscountAmount: global_discount_amount,
    fallbackTaxes,
  });
  const now =
    new Date().toISOString().split("T")[0] ?? purchaseOrder.purchase_date;
  await persistPurchaseFiscalState({
    supabase,
    orgId: org.id,
    orderId: params.purchaseOrderId,
    mode: "confirm",
    items: updatedItems.map((item) => ({
      id: item.id,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_quantity: item.unit_quantity,
      unit_cost: item.unit_cost,
      subtotal: item.subtotal,
      variant_stocks: item.variant_stocks,
      tax_override:
        item.tax_override === null
          ? null
          : parsePurchaseTaxInputs(item.tax_override),
    })),
    plan,
    subtotal: subtotalAmount,
    discountPercentage: global_discount_percentage,
    discountAmount: global_discount_amount,
    fallbackTaxes,
    supplierId: params.supplierId,
    purchaseDate: now,
    expirationDate: purchaseOrder.expiration_date,
    payableDueDate: params.expirationDate ?? purchaseOrder.purchase_date,
    remittanceNumber: purchaseOrder.remittance_number,
    nextStatus: "ORDERED",
  });

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

  const accessContext = await resolveAccessContext(supabase, orgSlug);

  let query = supabase
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
    .eq("organization_id", org.id);

  if (accessContext.scope === "own" && accessContext.userId) {
    query = query.eq("created_by", accessContext.userId);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

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

/**
 * Returns a paginated list of purchase orders for the given organization.
 * Omits items to reduce payload (only the list view).
 */

async function applySupplierSearchToQuery(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  search: string
): Promise<string[]> {
  const { data: matchingSuppliers } = await supabase
    .from("suppliers")
    .select("id")
    .eq("organization_id", orgId)
    .ilike("name", `%${search}%`)
    .limit(200);

  return (matchingSuppliers ?? []).map((s) => s.id);
}

function applyPurchaseSort(
  // biome-ignore lint/suspicious/noExplicitAny: generic query builder type
  query: any,
  params: PaginationParams
  // biome-ignore lint/suspicious/noExplicitAny: generic query builder type
): any {
  let q = query;
  const ALLOWED_SORT_COLUMNS: string[] = [
    "purchase_number",
    "purchase_date",
    "expiration_date",
    "in_transit_at",
    "received_at",
    "cancelled_at",
    "total_amount",
  ];
  const sort = (params.sort ?? []).filter((s) =>
    ALLOWED_SORT_COLUMNS.includes(s.id)
  );
  if (sort.length > 0) {
    for (const s of sort) {
      q = q.order(s.id, { ascending: !s.desc });
    }
  } else {
    q = q.order("created_at", { ascending: false });
  }
  return q;
}

export async function getPurchasesPaginated(
  orgSlug: string,
  params: PaginationParams
): Promise<PaginatedResult<PurchaseOrderWithSupplier>> {
  const page = Math.max(1, params.page);
  const pageSize = Math.min(100, Math.max(1, params.pageSize));

  let org: Awaited<ReturnType<typeof getOrganizationBySlug>>;
  try {
    org = await getOrganizationBySlug(orgSlug);
  } catch (err) {
    throw new Error(
      `Error fetching organization for purchases: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!org?.id) {
    return {
      data: [],
      totalCount: 0,
      page,
      pageSize,
    };
  }

  const supabase = await createClient();

  const accessContext = await resolveAccessContext(supabase, orgSlug);

  let query = supabase
    .from("purchase_orders")
    .select(
      `
      *,
      supplier:suppliers(id, name)
    `,
      { count: "exact" }
    )
    .eq("organization_id", org.id);

  if (accessContext.scope === "own" && accessContext.userId) {
    query = query.eq("created_by", accessContext.userId);
  }

  if (params.search) {
    const supplierIds = await applySupplierSearchToQuery(
      supabase,
      org.id,
      params.search
    );

    const parts: string[] = [];
    if (supplierIds.length > 0) {
      parts.push(`supplier_id.in.(${supplierIds.join(",")})`);
    }

    const num = Number(params.search);
    if (!Number.isNaN(num) && Number.isFinite(num)) {
      parts.push(`purchase_number.eq.${num}`);
    }

    parts.push(`remittance_number.ilike.%${params.search}%`);

    query = query.or(parts.join(","));
  }

  query = applyFilters(query, params);
  query = applyPurchaseSort(query, params);

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Error fetching purchases: ${error.message}`);
  }

  const mapped = (data ?? []).map((order) => {
    const supplier = (order as Record<string, unknown>).supplier;
    const supplierData = Array.isArray(supplier) ? supplier[0] : supplier;
    const normalizedSupplier =
      supplierData &&
      typeof supplierData === "object" &&
      "id" in (supplierData as Record<string, unknown>) &&
      "name" in (supplierData as Record<string, unknown>)
        ? (supplierData as { id: string; name: string })
        : {
            id: (order as Record<string, unknown>).supplier_id as string,
            name: "Sin asignar",
          };

    return {
      ...order,
      supplier: normalizedSupplier,
      items: [],
    } as PurchaseOrderWithSupplier;
  });

  return {
    data: mapped,
    totalCount: count ?? 0,
    page,
    pageSize,
  };
}

/**
 * Returns metrics (aggregations) for purchases in the organization.
 */
export async function getPurchaseMetrics(
  orgSlug: string
): Promise<PurchaseMetrics> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    return {
      totalMonth: 0,
      totalAmountMonth: 0,
      orderedMonth: 0,
      receivedMonth: 0,
    };
  }

  const supabase = await createClient();

  const accessContext = await resolveAccessContext(supabase, orgSlug);

  const now = new Date();
  const firstDayOfMonth = new Date(
    now.getFullYear(),
    now.getMonth(),
    1
  ).toISOString();

  let query = supabase
    .from("purchase_orders")
    .select("status, total_amount")
    .eq("organization_id", org.id)
    .gte("purchase_date", firstDayOfMonth);

  if (accessContext.scope === "own" && accessContext.userId) {
    query = query.eq("created_by", accessContext.userId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Error fetching purchase metrics: ${error.message}`);
  }

  const totalMonth = data?.length ?? 0;
  const totalAmountMonth =
    data
      ?.filter((p) => p.status === "RECEIVED")
      .reduce((sum, p) => sum + (Number(p.total_amount) || 0), 0) ?? 0;
  const orderedMonth = data?.filter((p) => p.status === "ORDERED").length ?? 0;
  const receivedMonth =
    data?.filter((p) => p.status === "RECEIVED").length ?? 0;

  return {
    totalMonth,
    totalAmountMonth,
    orderedMonth,
    receivedMonth,
  };
}

/**
 * Returns all purchases (unpaginated, no items) for export.
 */
export async function getAllPurchasesForExport(
  orgSlug: string,
  params: { estado?: string } = {}
): Promise<PurchaseOrderWithSupplier[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    return [];
  }

  // TODO: add purchases.read permission check

  const supabase = await createClient();

  const accessContext = await resolveAccessContext(supabase, orgSlug);

  let query = supabase
    .from("purchase_orders")
    .select(
      `
      *,
      supplier:suppliers(id, name),
      items:purchase_order_items(
        quantity,
        unit_quantity,
        subtotal,
        product_id,
        product:products(id, name, unit_of_measure)
      )
    `
    )
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false })
    .limit(10_000);

  if (accessContext.scope === "own" && accessContext.userId) {
    query = query.eq("created_by", accessContext.userId);
  }

  if (params.estado && params.estado !== "ALL") {
    query = query.eq("status", params.estado as PurchaseOrder["status"]);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching purchases for export:", error.message);
    return [];
  }

  if (!data) {
    return [];
  }

  return data.map((order: PurchaseOrderWithSupplierRaw) => {
    const supplier = order.supplier;
    const supplierData = Array.isArray(supplier) ? supplier[0] : supplier;
    const purchaseItems = (order.items ?? []).map(normalizePurchaseExportItem);

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

  const accessContext = await resolveAccessContext(supabase, orgSlug);

  let query = supabase
    .from("purchase_orders")
    .select(`
      *,
      supplier:suppliers(id, name)
    `)
    .eq("organization_id", org.id)
    .eq("supplier_id", supplierId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (accessContext.scope === "own" && accessContext.userId) {
    query = query.eq("created_by", accessContext.userId);
  }

  const { data, error } = await query;

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

export async function processPurchaseReceipt(
  orgSlug: string,
  purchaseOrderId: string,
  receivedItemIds: string[],
  itemUpdates: UpdateReceivedItemInput[]
): Promise<void> {
  const prepared = await preparePurchaseReceiptFiscalState(
    orgSlug,
    purchaseOrderId,
    receivedItemIds,
    itemUpdates
  );
  await persistPurchaseFiscalState({
    supabase: prepared.supabase,
    orgId: prepared.orgId,
    orderId: purchaseOrderId,
    mode: prepared.order.tax_snapshot_initialized
      ? "receipt"
      : "receipt_legacy",
    items: prepared.items,
    plan: prepared.plan,
    subtotal: prepared.subtotal,
    discountPercentage: prepared.discountPercentage,
    discountAmount: prepared.discountAmount,
    fallbackTaxes: prepared.fallbackTaxes,
    supplierId: prepared.order.supplier_id,
    purchaseDate: prepared.order.purchase_date,
    expirationDate: prepared.order.expiration_date,
    remittanceNumber: prepared.order.remittance_number,
  });
}

/** Validate fiscal inputs before the receipt starts creating lots or moving stock. */
export async function prevalidatePurchaseReceiptFiscalState(
  orgSlug: string,
  purchaseOrderId: string,
  receivedItemIds: string[],
  itemUpdates: UpdateReceivedItemInput[]
): Promise<void> {
  await preparePurchaseReceiptFiscalState(
    orgSlug,
    purchaseOrderId,
    receivedItemIds,
    itemUpdates
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: validates the receipt and prepares the fiscal state without modifying stock.
async function preparePurchaseReceiptFiscalState(
  orgSlug: string,
  purchaseOrderId: string,
  receivedItemIds: string[],
  itemUpdates: UpdateReceivedItemInput[]
) {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }
  const supabase = await createClient();
  const { data: order } = await supabase
    .from("purchase_orders")
    .select("*")
    .eq("id", purchaseOrderId)
    .eq("organization_id", org.id)
    .single();
  if (!order || order.status !== "IN_TRANSIT") {
    throw new Error("Solo se puede recibir una compra en tránsito");
  }
  const { data: storedItems, error } = await supabase
    .from("purchase_order_items")
    .select("*")
    .eq("purchase_order_id", purchaseOrderId)
    .eq("organization_id", org.id);
  if (error) {
    throw new Error(`Error al validar ítems de recepción: ${error.message}`);
  }
  const byId = new Map((storedItems ?? []).map((item) => [item.id, item]));
  if (
    receivedItemIds.length === 0 ||
    new Set(receivedItemIds).size !== receivedItemIds.length ||
    receivedItemIds.some((id) => !byId.has(id)) ||
    itemUpdates.length !== receivedItemIds.length ||
    new Set(itemUpdates.map((item) => item.itemId)).size !==
      itemUpdates.length ||
    itemUpdates.some(
      (item) =>
        !(
          receivedItemIds.includes(item.itemId) &&
          Number.isFinite(item.unitCost ?? 0) &&
          Number.isFinite(item.quantity ?? 0) &&
          Number.isFinite(item.unitQuantity ?? 0) &&
          (item.unitCost ?? 0) >= 0 &&
          (item.quantity ?? 0) >= 0 &&
          (item.unitQuantity ?? 0) >= 0
        )
    )
  ) {
    throw new Error("La recepción contiene ítems o importes inválidos");
  }
  const snapshots = await getPurchaseItemTaxRows(
    supabase,
    org.id,
    purchaseOrderId
  );
  const byItem = new Map<string, ItemTaxInput[]>();
  for (const tax of snapshots) {
    if (tax.source === "fallback" || tax.source === "legacy_prorated") {
      continue;
    }
    byItem.set(tax.purchase_order_item_id, [
      ...(byItem.get(tax.purchase_order_item_id) ?? []),
      toPurchaseItemTaxInput(tax),
    ]);
  }
  const items = itemUpdates.map((update) => {
    const stored = byId.get(update.itemId);
    if (!stored) {
      throw new Error("El ítem no pertenece a la compra");
    }
    const unitQuantity = update.unitQuantity ?? stored.unit_quantity ?? 0;
    const quantity = update.quantity ?? stored.quantity;
    const cost = update.unitCost ?? stored.unit_cost ?? 0;
    return {
      id: stored.id,
      product_id: stored.product_id,
      quantity,
      unit_quantity: unitQuantity,
      unit_cost: cost,
      variant_stocks: stored.variant_stocks,
      tax_override:
        stored.tax_override === null
          ? null
          : parsePurchaseTaxInputs(stored.tax_override),
      subtotal: truncateMoney(
        (unitQuantity > 0 ? unitQuantity : quantity) * cost
      ),
      taxes:
        stored.tax_override === null
          ? (byItem.get(stored.id) ??
            (order.tax_snapshot_initialized ? [] : undefined))
          : parsePurchaseTaxInputs(stored.tax_override),
    };
  });
  const subtotal = items.reduce(
    (sum, line) => truncateMoney(sum + line.subtotal),
    0
  );
  const { global_discount_percentage, global_discount_amount } =
    calculateGlobalDiscount(subtotal, order.global_discount_percentage ?? 0);
  const fallbackTaxes = parsePurchaseTaxInputs(order.fallback_taxes);
  if (!order.tax_snapshot_initialized) {
    const { data: aggregate, error: aggregateError } = await supabase
      .from("purchase_order_taxes")
      .select("tax_id, name, rate, tax_code_snapshot")
      .eq("purchase_order_id", purchaseOrderId)
      .eq("organization_id", org.id);
    if (aggregateError) {
      throw new Error(
        `Error al validar impuestos históricos: ${aggregateError.message}`
      );
    }
    const base = truncateMoney(Math.max(0, subtotal - global_discount_amount));
    const aggregateTaxes = (aggregate ?? []).map((tax) => ({
      taxId: tax.tax_id,
      name: tax.name,
      rate: tax.rate,
      baseAmount: base,
      taxAmount: truncateMoney((base * tax.rate) / 100),
      taxCodeSnapshot: tax.tax_code_snapshot,
    }));
    return {
      supabase,
      orgId: org.id,
      order,
      items,
      subtotal,
      discountPercentage: global_discount_percentage,
      discountAmount: global_discount_amount,
      fallbackTaxes,
      plan: {
        lineBases: new Map<string, number>(),
        itemTaxes: [],
        aggregateTaxes,
        totalTaxAmount: aggregateTaxes.reduce(
          (sum, tax) => truncateMoney(sum + tax.taxAmount),
          0
        ),
      },
    };
  }
  const plan = await buildPurchaseTaxPlan({
    supabase,
    orgId: org.id,
    lines: items,
    globalDiscountAmount: global_discount_amount,
    fallbackTaxes,
  });
  return {
    supabase,
    orgId: org.id,
    order,
    items,
    subtotal,
    discountPercentage: global_discount_percentage,
    discountAmount: global_discount_amount,
    fallbackTaxes,
    plan,
  };
}

export type UpdatePurchaseOrderInput = {
  orgSlug: string;
  purchaseOrderId: string;
  convertLegacyTaxes?: boolean;
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
    unit_of_measure?: string | null;
    variant_stocks?: Record<string, Record<string, number>> | null;
    taxes?: ItemTaxInput[];
  }[];
  taxes?: PurchaseTaxInput;
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
 * Updates a purchase order with its items
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: validates editability and synchronizes purchase items, tax snapshots and payables.
export async function updatePurchaseOrder(
  input: UpdatePurchaseOrderInput
): Promise<PurchaseOrder> {
  const org = await getOrganizationBySlug(input.orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const updateData = buildPurchaseOrderUpdateData(input);
  if (input.items && input.items.length === 0) {
    throw new Error("La orden de compra debe tener al menos un producto");
  }
  const { data: existingOrder } = await supabase
    .from("purchase_orders")
    .select("*")
    .eq("id", input.purchaseOrderId)
    .eq("organization_id", org.id)
    .single();
  if (!(existingOrder && ["ORDERED", "DRAFT"].includes(existingOrder.status))) {
    throw new Error("Solo se pueden editar compras en borrador u ordenadas");
  }
  if (
    !existingOrder.tax_snapshot_initialized &&
    existingOrder.status !== "DRAFT"
  ) {
    if (!input.convertLegacyTaxes) {
      const { data: savedItems, error: savedItemsError } = await supabase
        .from("purchase_order_items")
        .select(
          "id, product_id, quantity, unit_quantity, unit_cost, subtotal, variant_stocks"
        )
        .eq("purchase_order_id", input.purchaseOrderId)
        .eq("organization_id", org.id);
      if (savedItemsError) {
        throw new Error(
          `Error al validar compra histórica: ${savedItemsError.message}`
        );
      }
      if (
        legacyPurchaseFiscalFieldsChanged({
          savedItems: savedItems ?? [],
          inputItems: input.items,
          savedDiscountPercent: existingOrder.global_discount_percentage ?? 0,
          inputDiscountPercent: input.global_discount_percentage,
          selectedTaxCount: input.taxes?.length ?? 0,
        })
      ) {
        throw new Error(
          "Para editar importes o impuestos históricos, convertí la compra por ítem explícitamente"
        );
      }
      const { data: updated, error } = await supabase
        .from("purchase_orders")
        .update(updateData)
        .eq("id", input.purchaseOrderId)
        .eq("organization_id", org.id)
        .select("*")
        .single();
      if (error || !updated) {
        throw new Error(
          `Error al editar compra histórica: ${error?.message ?? "No encontrada"}`
        );
      }
      const dueDate = input.expiration_date ?? updated.expiration_date;
      if (dueDate && updated.supplier_id) {
        await syncAccountsPayable({
          supabase,
          orgId: org.id,
          supplierId: updated.supplier_id,
          purchaseOrderId: updated.id,
          totalAmount: updated.total_amount,
          dueDate,
        });
      }
      return updated;
    }
    if (
      !input.items?.length ||
      input.items.some((item) => !Array.isArray(item.taxes))
    ) {
      throw new Error(
        "La conversión requiere revisar los impuestos de cada producto"
      );
    }
  }
  const savedFallbackTaxes = parsePurchaseTaxInputs(
    existingOrder.fallback_taxes
  );
  const savedRows = await getPurchaseItemTaxRows(
    supabase,
    org.id,
    input.purchaseOrderId
  );
  const savedLineTaxes = new Map<string, ItemTaxInput[]>();
  for (const row of savedRows) {
    if (row.source === "fallback" || row.source === "legacy_prorated") {
      continue;
    }
    const current = savedLineTaxes.get(row.purchase_order_item_id) ?? [];
    current.push(toPurchaseItemTaxInput(row));
    savedLineTaxes.set(row.purchase_order_item_id, current);
  }
  const selections = await resolvePurchaseTaxSelections({
    supabase,
    orgId: org.id,
    lines: input.items ?? [],
    fallbackTaxes: input.taxes ?? savedFallbackTaxes,
    savedLineTaxes,
    savedFallbackTaxes,
  });
  const fallbackTaxes = selections.fallbackTaxes;
  const resolvedItems = input.items?.map((item, index) => ({
    ...item,
    taxes: selections.lineTaxes[index],
  }));
  if (resolvedItems && resolvedItems.length > 0) {
    const subtotal = resolvedItems.reduce(
      (sum, item) =>
        truncateMoney(
          sum + truncateMoney(item.subtotal ?? item.quantity * item.unit_cost)
        ),
      0
    );
    const { global_discount_amount } = calculateGlobalDiscount(
      subtotal,
      input.global_discount_percentage ??
        existingOrder.global_discount_percentage ??
        0
    );
    const taxPlan = await buildPurchaseTaxPlan({
      supabase,
      orgId: org.id,
      lines: resolvedItems.map((item, index) => ({
        id: `item-${index}`,
        product_id: item.product_id,
        subtotal: item.subtotal ?? item.quantity * item.unit_cost,
        taxes: item.taxes,
      })),
      globalDiscountAmount: global_discount_amount,
      fallbackTaxes,
    });

    const storedItems = resolvedItems.map((item) => ({
      id: crypto.randomUUID(),
      product_id: item.product_id,
      quantity: Math.max(
        ["KG", "LT", "MT"].includes(item.unit_of_measure ?? "") ? 0 : 1,
        item.quantity
      ),
      unit_quantity: item.unit_quantity,
      unit_cost: truncateMoney(item.unit_cost),
      subtotal: truncateMoney(item.subtotal),
      variant_stocks: item.variant_stocks ?? null,
      tax_override: item.taxes ?? null,
    }));
    const idByLine = new Map(
      storedItems.map((item, index) => [`item-${index}`, item.id])
    );
    return persistPurchaseFiscalState({
      supabase,
      orgId: org.id,
      orderId: input.purchaseOrderId,
      mode: "replace",
      items: storedItems,
      plan: {
        ...taxPlan,
        itemTaxes: taxPlan.itemTaxes.map((tax) => ({
          ...tax,
          lineId: idByLine.get(tax.lineId) ?? tax.lineId,
        })),
      },
      subtotal,
      discountPercentage:
        input.global_discount_percentage ??
        existingOrder.global_discount_percentage ??
        0,
      discountAmount: global_discount_amount,
      fallbackTaxes,
      supplierId: input.supplier_id ?? existingOrder.supplier_id,
      purchaseDate: input.purchase_date ?? existingOrder.purchase_date,
      expirationDate:
        input.expiration_date !== undefined
          ? input.expiration_date
          : existingOrder.expiration_date,
      payableDueDate:
        input.expiration_date !== undefined
          ? input.expiration_date
          : existingOrder.expiration_date,
      remittanceNumber:
        input.remittance_number !== undefined
          ? input.remittance_number
          : existingOrder.remittance_number,
    });
  }
  if (input.taxes !== undefined) {
    throw new Error(
      "Para cambiar impuestos hay que enviar los ítems de la compra"
    );
  }
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

  const payableDueDate =
    input.expiration_date ?? purchaseOrder.expiration_date ?? null;

  if (payableDueDate && purchaseOrder.supplier_id) {
    await syncAccountsPayable({
      supabase,
      orgId: org.id,
      supplierId: purchaseOrder.supplier_id,
      purchaseOrderId: input.purchaseOrderId,
      totalAmount: purchaseOrder.total_amount,
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
      category_id?: string | null;
      accountingAccountCode?: string | null;
      product_name?: string;
      product_sku?: string | null;
      unit_of_measure?: string | null;
      weight_per_unit?: number | null;
      has_variants?: boolean;
      tax_override?: ItemTaxInput[] | null;
      item_taxes?: Awaited<ReturnType<typeof getPurchaseItemTaxRows>>;
    })[];
    fallback_taxes?: ItemTaxInput[];
    fiscal_data_invalid: boolean;
    taxes: Array<{
      tax_id: string | null;
      name: string;
      rate: number;
      tax_amount: number;
      tax_code_snapshot: string | null;
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
      product:products(id, name, sku, category_id, accounting_account_code, weight_per_unit, unit_of_measure, has_variants)
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
    .select("tax_id, name, rate, tax_amount, tax_code_snapshot")
    .eq("purchase_order_id", purchaseOrderId)
    .eq("organization_id", org.id);

  if (taxesError) {
    throw new Error(
      `Error fetching purchase order taxes: ${taxesError.message}`
    );
  }
  const itemTaxRows = await getPurchaseItemTaxRows(
    supabase,
    org.id,
    purchaseOrderId
  );

  const categoryIds = Array.from(
    new Set(
      (items ?? [])
        .map((item) => {
          const product = item.product as
            | {
                category_id?: string | null;
              }
            | null
            | undefined;

          return product?.category_id ?? null;
        })
        .filter((categoryId): categoryId is string => Boolean(categoryId))
    )
  );
  const categoryRules = categoryIds.length
    ? await getCategoryAccountingRules(orgSlug, categoryIds)
    : [];
  const accountingRuleByCategoryId = new Map(
    categoryRules.map((rule) => [rule.categoryId, rule.accountCode])
  );
  const parsedFallback = tryParsePurchaseTaxInputs(order.fallback_taxes);
  let fiscalDataInvalid = parsedFallback === null;
  const mappedItems = (items || []).map(
    (
      item: PurchaseOrderItem & {
        product?: {
          id: string;
          name: string;
          sku: string;
          category_id?: string | null;
          accounting_account_code?: string | null;
          weight_per_unit?: number | null;
          unit_of_measure?: string | null;
          has_variants?: boolean | null;
        } | null;
      }
    ) => {
      const parsedOverride =
        item.tax_override === null
          ? null
          : tryParsePurchaseTaxInputs(item.tax_override);
      if (item.tax_override !== null && parsedOverride === null) {
        fiscalDataInvalid = true;
      }
      return {
        ...item,
        category_id: item.product?.category_id ?? null,
        accountingAccountCode:
          item.product?.accounting_account_code ??
          (item.product?.category_id
            ? (accountingRuleByCategoryId.get(item.product.category_id) ?? null)
            : null),
        product_name: item.product?.name || item.product_id,
        product_sku: item.product?.sku ?? null,
        weight_per_unit: item.product?.weight_per_unit ?? null,
        unit_of_measure: item.product?.unit_of_measure ?? null,
        has_variants: item.product?.has_variants ?? false,
        tax_override: parsedOverride,
        item_taxes: itemTaxRows.filter(
          (tax) => tax.purchase_order_item_id === item.id
        ),
      };
    }
  );

  return {
    ...order,
    fallback_taxes: parsedFallback ?? [],
    fiscal_data_invalid: fiscalDataInvalid,
    taxes: taxes || null,
    items: mappedItems,
  };
}

// Helper functions for processBulkSupplierPayment
type PendingPayableAccount = {
  id: string;
  purchase_order_id: string;
  total_amount: number;
  pending_balance: number;
  due_date: string;
  currency: string;
  exchange_rate: number | null;
  purchase?:
    | { purchase_number?: number | null }
    | Array<{ purchase_number?: number | null }>
    | null;
};

function calculateSupplierPaymentDistributions(
  pendingAccounts: PendingPayableAccount[],
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
    currency: string;
    exchangeRate?: number | null;
  }
) {
  const {
    orgId,
    paymentsToInsert,
    paymentMethodValue,
    paymentDateValue,
    sanitizedReference,
    sanitizedNotes,
    currency,
    exchangeRate,
  } = params;

  return supabase.from("payable_payments").insert(
    paymentsToInsert.map((p) => {
      const currencyFields = resolvePaymentCurrencyFields(
        currency,
        p.amount,
        exchangeRate
      );
      return {
        organization_id: orgId,
        account_payable_id: p.account_payable_id,
        amount: truncateMoney(p.amount),
        currency: currencyFields.currency,
        exchange_rate: currencyFields.exchangeRate,
        amount_ars: currencyFields.amountArs,
        payment_method: paymentMethodValue,
        payment_date: paymentDateValue,
        reference_number: sanitizedReference,
        notes: sanitizedNotes,
      };
    })
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
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: bulk payment distributes FIFO across supplier payables and reconciles currency scoping.
export async function processBulkSupplierPayment(input: {
  orgSlug: string;
  supplierId: string;
  totalAmount: number;
  paymentMethod: string;
  paymentDate?: string;
  referenceNumber?: string;
  notes?: string;
  currency?: string;
  exchangeRate?: number | null;
}): Promise<{
  success: boolean;
  error?: string;
  code?: string;
  appliedAmount?: number;
  creditBalance?: number;
  affectedAccounts?: number;
  excludedCount?: number;
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
    currency,
  } = input;

  const batchCurrency = (currency ?? "ARS").toUpperCase();
  if (batchCurrency !== "ARS" && batchCurrency !== "USD") {
    return {
      success: false,
      error: "Moneda no soportada",
      code: "invalid_currency",
    };
  }

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
      currency,
      exchange_rate,
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

  const payableAccounts = (pendingAccounts ??
    []) as unknown as PendingPayableAccount[];

  if (payableAccounts.length === 0) {
    return {
      success: false,
      error: "No hay cuentas pendientes para este proveedor",
      code: "no_pending_accounts",
    };
  }

  const batchAccounts = payableAccounts.filter(
    (account) => (account.currency ?? "ARS") === batchCurrency
  );
  const excludedCount = payableAccounts.length - batchAccounts.length;

  if (batchAccounts.length === 0) {
    return {
      success: false,
      error:
        batchCurrency === "USD"
          ? "Este proveedor no tiene deudas en dólares pendientes para este lote."
          : "Este proveedor tiene deudas solo en USD. Elegí la moneda USD para ese lote.",
      code: "no_accounts_in_currency",
    };
  }

  // La tasa de un lote USD es la fijada por las facturas de compra. Se deriva
  // server-side: si falta alguna factura o las cotizaciones difieren, se bloquea.
  let effectiveExchangeRate: number | null = null;
  if (batchCurrency === "USD") {
    const batchRates: number[] = [];
    for (const account of batchAccounts) {
      const rate = await resolvePayableExchangeRate({
        supabase,
        orgId: org.id,
        payable: {
          currency: account.currency,
          supplier_id: supplierId,
          purchase_order_id: account.purchase_order_id,
          exchange_rate: account.exchange_rate,
        },
      });
      if (rate == null) {
        return {
          success: false,
          error: NO_PAYABLE_INVOICE_RATE_MESSAGE,
          code: "exchange_rate_required",
        };
      }
      batchRates.push(rate);
    }

    if (new Set(batchRates).size > 1) {
      return {
        success: false,
        error: "Las facturas tienen cotizaciones distintas. Pagá por factura.",
        code: "exchange_rate_conflict",
      };
    }
    effectiveExchangeRate = batchRates[0] ?? null;
  }

  // Calculate distribution (FIFO) solo sobre cuentas de la moneda del lote
  const {
    distributions,
    accountsToUpdate,
    paymentsToInsert,
    appliedAmount,
    creditBalance,
  } = calculateSupplierPaymentDistributions(
    batchAccounts,
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
    currency: batchCurrency,
    exchangeRate: effectiveExchangeRate,
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
      currency: batchCurrency,
    });
  }

  return {
    success: true,
    appliedAmount,
    creditBalance,
    affectedAccounts: distributions.length,
    distributions,
    excludedCount: excludedCount > 0 ? excludedCount : undefined,
  };
}

async function saveSupplierCredit(options: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  orgId: string;
  supplierId: string;
  creditBalance: number;
  notes: string | null;
  currency?: string;
}) {
  const { supabase, orgId, supplierId, creditBalance, notes, currency } =
    options;

  const creditNotes = notes
    ? `Crédito generado por pago masivo. ${notes}`
    : "Crédito generado por pago masivo";

  const { error } = await supabase.from("supplier_credits" as never).insert({
    organization_id: orgId,
    supplier_id: supplierId,
    amount: truncateMoney(creditBalance),
    remaining_amount: truncateMoney(creditBalance),
    currency: (currency ?? "ARS").toUpperCase(),
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
  totalAmount: number,
  currency?: string
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
    exchangeRate: number | null;
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
      currency,
      exchange_rate,
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

  const payableAccounts = (pendingAccounts ??
    []) as unknown as PendingPayableAccount[];

  if (payableAccounts.length === 0) {
    return [];
  }

  const batchCurrency = (currency ?? "ARS").toUpperCase();
  const batchAccounts = payableAccounts.filter(
    (account) => (account.currency ?? "ARS") === batchCurrency
  );

  if (batchAccounts.length === 0) {
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
    exchangeRate: number | null;
  }> = [];

  for (const account of batchAccounts) {
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

    const exchangeRate = await resolvePayableExchangeRate({
      supabase,
      orgId: org.id,
      payable: {
        currency: account.currency,
        supplier_id: supplierId,
        purchase_order_id: account.purchase_order_id,
        exchange_rate: account.exchange_rate,
      },
    });

    distributions.push({
      accountId: account.id,
      purchaseNumber: purchase?.purchase_number ?? null,
      dueDate: account.due_date,
      totalAmount: totalAccountAmount,
      pendingBalance,
      appliedAmount,
      newBalance,
      newStatus,
      exchangeRate,
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

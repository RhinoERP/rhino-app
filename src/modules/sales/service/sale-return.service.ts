import { truncateMoney } from "@/lib/decimal";
import { createClient } from "@/lib/supabase/server";
import { createCreditNote } from "@/modules/credit-notes/service/credit-notes.service";
import type {
  CreateCreditNoteItemInput,
  CreateCreditNoteItemTaxInput,
  CreateCreditNoteResult,
  CreateCreditNoteSourceDocumentInput,
  CreateCreditNoteTaxInput,
} from "@/modules/credit-notes/types";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { Database } from "@/types/supabase";
import {
  deriveSaleCreditSupplier,
  formatSaleMovementReason,
  getSalesAccessContext,
  type SalesOrderDetail,
} from "./sales.service";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type ReceivableStatus = Database["public"]["Enums"]["receivable_status"];
type ReturnedItemCondition =
  Database["public"]["Enums"]["returned_item_condition"];

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type SaleReturnItemInput = {
  salesOrderItemId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  restock?: boolean;
  itemCondition?: ReturnedItemCondition;
  unitQuantity?: number;
};

export type CreateSaleReturnInput = {
  orgSlug: string;
  saleId: string;
  reason: string;
  notes?: string | null;
  items: SaleReturnItemInput[];
  emitCreditNote?: boolean;
  requireCreditNote?: boolean;
  additionalCreditAmount?: number;
};

export type CreateSaleReturnResult = {
  returnId: string;
  returnTotal: number;
  creditNoteId?: string | null;
  creditNoteNumber?: string | null;
};

export type SaleReturnSourceItem = {
  id: string;
  product_id: string | null;
  description: string | null;
  quantity: number | null;
  unit_quantity: number | null;
  unit_price: number | null;
  base_price: number | null;
  discount_amount: number | null;
  subtotal: number | null;
  product?: { name?: string | null } | null;
  item_taxes?: Array<{
    id: string;
    tax_id: string | null;
    name: string | null;
    rate: number | null;
    tax_amount: number | null;
    base_amount: number | null;
    tax_code_snapshot: string | null;
    source: string | null;
  }> | null;
};

export type SaleReturnSourceTax = {
  id: string;
  tax_id: string | null;
  name: string | null;
  rate: number | null;
  tax_amount: number | null;
  base_amount: number | null;
  tax_code_snapshot: string | null;
};

export type SaleReturnSourceSale = {
  id: string;
  status: string;
  customer_id: string | null;
  total_amount: number | null;
  sub_total: number | null;
  global_discount_amount: number | null;
  invoice_type: Database["public"]["Enums"]["invoice_type"];
  invoice_number: string | null;
  sale_date: string | null;
  arca_status: string | null;
  arca_point_of_sale: number | null;
  arca_voucher_number: number | null;
  arca_voucher_type_code: number | null;
  arca_authorized_at: string | null;
  items?: SaleReturnSourceItem[] | null;
  taxes?: SaleReturnSourceTax[] | null;
};

export type ResolvedSaleReturnLine = {
  input: SaleReturnItemInput;
  saleItem: SaleReturnSourceItem;
  itemCondition: ReturnedItemCondition;
  restock: boolean;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
  unitQuantity?: number;
  itemTaxes?: CreateCreditNoteItemTaxInput[];
};

export type ReturnedItemTotals = {
  quantity: number;
  unitQuantity: number;
};

// ---------------------------------------------------------------------------
// Receivable helpers (mirrors private helpers in sales.service.ts)
// ---------------------------------------------------------------------------

function resolveReceivableStatus(
  totalAmount: number,
  pendingBalance: number
): ReceivableStatus {
  if (pendingBalance <= 0) {
    return "PAID";
  }
  if (pendingBalance < totalAmount) {
    return "PARTIALLY_PAID";
  }
  return "PENDING";
}

function resolveReturnedItemCondition(
  item: SaleReturnItemInput
): ReturnedItemCondition {
  if (item.itemCondition) {
    return item.itemCondition;
  }

  return item.restock === false ? "DAMAGED" : "GOOD";
}

function shouldRestockReturnedItem(condition: ReturnedItemCondition): boolean {
  return condition === "GOOD";
}

async function getPreviouslyReturnedQuantities(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  saleId: string;
}): Promise<Map<string, ReturnedItemTotals>> {
  const { data: returns, error: returnsError } = await params.supabase
    .from("sales_returns")
    .select("id")
    .eq("sales_order_id", params.saleId)
    .eq("organization_id", params.orgId);

  if (returnsError) {
    throw new Error(
      `No se pudieron obtener devoluciones previas: ${returnsError.message}`
    );
  }

  const returnIds = (returns ?? []).map((row) => row.id);
  if (!returnIds.length) {
    return new Map();
  }

  const { data: items, error: itemsError } = await params.supabase
    .from("sales_return_items")
    .select("sales_order_item_id, quantity, unit_quantity")
    .in("sales_return_id", returnIds);

  if (itemsError) {
    throw new Error(
      `No se pudieron obtener ítems devueltos previamente: ${itemsError.message}`
    );
  }

  const quantities = new Map<string, ReturnedItemTotals>();
  for (const item of items ?? []) {
    if (!item.sales_order_item_id) {
      continue;
    }

    const current = quantities.get(item.sales_order_item_id) ?? {
      quantity: 0,
      unitQuantity: 0,
    };
    quantities.set(item.sales_order_item_id, {
      quantity: truncateMoney(current.quantity + Number(item.quantity ?? 0)),
      unitQuantity: truncateMoney(
        current.unitQuantity + Number(item.unit_quantity ?? 0)
      ),
    });
  }

  return quantities;
}

export function resolveReturnLines(params: {
  sale: SaleReturnSourceSale;
  returnItems: SaleReturnItemInput[];
  previouslyReturnedByItemId: Map<string, number | ReturnedItemTotals>;
}): ResolvedSaleReturnLine[] {
  const saleItems = params.sale.items ?? [];
  const saleItemsById = new Map(saleItems.map((item) => [item.id, item]));
  const saleSubtotal = truncateMoney(Number(params.sale.sub_total ?? 0));
  const globalDiscountAmount = truncateMoney(
    Math.max(0, Number(params.sale.global_discount_amount ?? 0))
  );
  const taxes = params.sale.taxes ?? [];
  const totalTaxRate = taxes.reduce(
    (sum, tax) => sum + Math.max(0, Number(tax.rate ?? 0)),
    0
  );

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: per-line fiscal validation and pricing must stay in one pass.
  return params.returnItems.map((input) => {
    const saleItem = saleItemsById.get(input.salesOrderItemId);

    if (!saleItem?.id) {
      throw new Error(
        `El ítem ${input.salesOrderItemId} no pertenece a la venta seleccionada.`
      );
    }

    if (saleItem.product_id && saleItem.product_id !== input.productId) {
      throw new Error(
        "Uno de los productos a devolver no coincide con la venta."
      );
    }

    const soldUnitQuantity = Number(saleItem.quantity ?? 0);
    const soldWeightQuantity = Number(saleItem.unit_quantity ?? 0);
    const usesWeightQuantity = soldWeightQuantity > 0;
    const soldQuantity = usesWeightQuantity
      ? soldWeightQuantity
      : soldUnitQuantity;
    const previouslyReturned = params.previouslyReturnedByItemId.get(
      saleItem.id
    );
    const alreadyReturned =
      typeof previouslyReturned === "number"
        ? previouslyReturned
        : (previouslyReturned?.quantity ?? 0);
    const alreadyReturnedUnits =
      typeof previouslyReturned === "number"
        ? 0
        : (previouslyReturned?.unitQuantity ?? 0);
    const availableQuantity = Math.max(0, soldQuantity - alreadyReturned);
    const availableUnitQuantity = Math.max(
      0,
      soldUnitQuantity - alreadyReturnedUnits
    );
    const requestedQuantity = Number(input.quantity ?? 0);

    if (requestedQuantity <= 0) {
      throw new Error("Debe indicar una cantidad mayor a cero para devolver.");
    }

    if (requestedQuantity - availableQuantity > 0.000_001) {
      throw new Error(
        `La cantidad a devolver de ${saleItem.description ?? saleItem.product?.name ?? "un producto"} supera lo disponible (${availableQuantity}).`
      );
    }

    const requestedUnitQuantity =
      input.unitQuantity !== undefined && input.unitQuantity !== null
        ? Number(input.unitQuantity)
        : null;
    const resolvedUnitQuantity =
      usesWeightQuantity && soldUnitQuantity > 0
        ? (requestedUnitQuantity ??
          truncateMoney(
            (requestedQuantity / soldWeightQuantity) * soldUnitQuantity
          ))
        : requestedUnitQuantity;

    if (
      resolvedUnitQuantity !== null &&
      (!Number.isFinite(resolvedUnitQuantity) || resolvedUnitQuantity < 0)
    ) {
      throw new Error("La cantidad de unidades a devolver es inválida.");
    }

    if (
      usesWeightQuantity &&
      requestedUnitQuantity !== null &&
      requestedUnitQuantity <= 0
    ) {
      throw new Error("Debe indicar unidades a devolver para el producto.");
    }

    if (
      usesWeightQuantity &&
      resolvedUnitQuantity !== null &&
      resolvedUnitQuantity - availableUnitQuantity > 0.000_001
    ) {
      throw new Error(
        `La cantidad de unidades a devolver de ${saleItem.description ?? saleItem.product?.name ?? "un producto"} supera lo disponible (${availableUnitQuantity}).`
      );
    }

    const unitPrice = truncateMoney(
      Number(
        usesWeightQuantity
          ? (saleItem.base_price ?? saleItem.unit_price ?? 0)
          : (saleItem.unit_price ?? 0)
      )
    );
    const grossAmount = truncateMoney(requestedQuantity * unitPrice);
    const lineDiscountPerUnit =
      soldQuantity > 0
        ? Math.max(0, Number(saleItem.discount_amount ?? 0)) / soldQuantity
        : 0;
    const lineDiscountAmount = truncateMoney(
      Math.min(grossAmount, lineDiscountPerUnit * requestedQuantity)
    );
    const subtotalAfterLineDiscount = truncateMoney(
      Math.max(0, grossAmount - lineDiscountAmount)
    );
    const itemSubtotal = truncateMoney(Number(saleItem.subtotal ?? 0));
    const itemGlobalDiscountShare =
      saleSubtotal > 0
        ? truncateMoney((itemSubtotal / saleSubtotal) * globalDiscountAmount)
        : 0;
    const globalDiscountPerUnit =
      soldQuantity > 0 ? itemGlobalDiscountShare / soldQuantity : 0;
    const globalDiscountLineAmount = truncateMoney(
      Math.min(
        subtotalAfterLineDiscount,
        globalDiscountPerUnit * requestedQuantity
      )
    );
    const discountAmount = truncateMoney(
      lineDiscountAmount + globalDiscountLineAmount
    );
    const netAmount = truncateMoney(
      Math.max(0, subtotalAfterLineDiscount - globalDiscountLineAmount)
    );
    const sourceItemTaxes = saleItem.item_taxes ?? [];
    const itemTaxes =
      sourceItemTaxes.length > 0
        ? sourceItemTaxes.map((tax) => ({
            salesOrderItemId: saleItem.id,
            productId: saleItem.product_id,
            taxId: tax.tax_id,
            name: tax.name ?? "Impuesto",
            rate: Number(tax.rate ?? 0),
            baseAmount: netAmount,
            taxAmount: truncateMoney(netAmount * (Number(tax.rate ?? 0) / 100)),
            taxCodeSnapshot: tax.tax_code_snapshot ?? null,
            source: tax.source ?? "product",
          }))
        : undefined;
    const taxAmount = itemTaxes
      ? truncateMoney(itemTaxes.reduce((sum, tax) => sum + tax.taxAmount, 0))
      : truncateMoney(netAmount * (totalTaxRate / 100));
    const totalAmount = truncateMoney(netAmount + taxAmount);
    const itemCondition = resolveReturnedItemCondition(input);

    return {
      input,
      saleItem,
      itemCondition,
      restock: shouldRestockReturnedItem(itemCondition),
      quantity: requestedQuantity,
      unitPrice,
      discountAmount,
      netAmount,
      taxAmount,
      totalAmount,
      unitQuantity: resolvedUnitQuantity ?? undefined,
      itemTaxes,
    };
  });
}

export function buildCreditNoteTaxesFromReturn(params: {
  sale: SaleReturnSourceSale;
  returnedNetAmount: number;
  lines?: ResolvedSaleReturnLine[];
}): CreateCreditNoteTaxInput[] {
  const itemTaxes = (params.lines ?? []).flatMap(
    (line) => line.itemTaxes ?? []
  );
  if (itemTaxes.length > 0) {
    const taxesByKey = new Map<string, CreateCreditNoteTaxInput>();

    for (const tax of itemTaxes) {
      const key = `${tax.taxId ?? "no-tax-id"}:${tax.name}:${tax.rate}:${tax.taxCodeSnapshot ?? ""}`;
      const current = taxesByKey.get(key);

      if (current) {
        current.baseAmount = truncateMoney(current.baseAmount + tax.baseAmount);
        current.taxAmount = truncateMoney(current.taxAmount + tax.taxAmount);
        continue;
      }

      taxesByKey.set(key, {
        taxId: tax.taxId,
        name: tax.name,
        rate: tax.rate,
        baseAmount: truncateMoney(tax.baseAmount),
        taxAmount: truncateMoney(tax.taxAmount),
        taxCodeSnapshot: tax.taxCodeSnapshot ?? null,
      });
    }

    return Array.from(taxesByKey.values());
  }

  return (params.sale.taxes ?? []).map((tax) => ({
    taxId: tax.tax_id,
    name: tax.name ?? "Impuesto",
    rate: Number(tax.rate ?? 0),
    baseAmount: truncateMoney(params.returnedNetAmount),
    taxAmount: truncateMoney(
      params.returnedNetAmount * (Number(tax.rate ?? 0) / 100)
    ),
    taxCodeSnapshot: tax.tax_code_snapshot ?? null,
  }));
}

export function buildCreditNoteItemsFromReturn(params: {
  saleId: string;
  lines: ResolvedSaleReturnLine[];
  insertedReturnItems: Array<{
    id: string;
    sales_order_item_id: string | null;
  }>;
}): CreateCreditNoteItemInput[] {
  const returnItemIdBySaleItemId = new Map(
    params.insertedReturnItems
      .filter((item) => item.sales_order_item_id)
      .map((item) => [item.sales_order_item_id as string, item.id])
  );

  return params.lines.map((line) => ({
    salesOrderId: params.saleId,
    salesOrderItemId: line.saleItem.id,
    salesReturnItemId: returnItemIdBySaleItemId.get(line.saleItem.id),
    productId: line.saleItem.product_id,
    description:
      line.saleItem.description ??
      line.saleItem.product?.name ??
      "Producto devuelto",
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    discountAmount: line.discountAmount,
    netAmount: line.netAmount,
    taxAmount: line.taxAmount,
    totalAmount: line.totalAmount,
  }));
}

export function buildCreditNoteItemTaxesFromReturn(
  lines: ResolvedSaleReturnLine[]
): CreateCreditNoteItemTaxInput[] {
  return lines.flatMap((line) =>
    (line.itemTaxes ?? []).map((tax) => ({
      salesOrderItemId: line.saleItem.id,
      productId: line.saleItem.product_id,
      taxId: tax.taxId,
      name: tax.name,
      rate: tax.rate,
      baseAmount: tax.baseAmount,
      taxAmount: tax.taxAmount,
      taxCodeSnapshot: tax.taxCodeSnapshot ?? null,
      source: tax.source ?? "product",
    }))
  );
}

export function buildCreditNoteSourceDocumentsFromReturn(params: {
  saleId: string;
  sale: SaleReturnSourceSale;
  returnTotal: number;
}): CreateCreditNoteSourceDocumentInput[] {
  return [
    {
      salesOrderId: params.saleId,
      appliedAmount: params.returnTotal,
      invoiceType: params.sale.invoice_type,
      invoiceNumber: params.sale.invoice_number,
      arcaStatus: params.sale.arca_status,
      arcaPointOfSale: params.sale.arca_point_of_sale,
      arcaVoucherNumber: params.sale.arca_voucher_number,
      arcaVoucherTypeCode: params.sale.arca_voucher_type_code,
      arcaVoucherDate: params.sale.sale_date,
    },
  ];
}

async function updateReceivableForReturn(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  saleId: string;
  customerId: string;
  returnTotal: number;
}): Promise<ReceivableRollback | null> {
  const { supabase, orgId, saleId, customerId, returnTotal } = params;

  const { data: receivable } = await supabase
    .from("accounts_receivable")
    .select("id, total_amount, pending_balance, status")
    .eq("sales_order_id", saleId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!receivable?.id) {
    return null;
  }

  const previousTotal = truncateMoney(Number(receivable.total_amount ?? 0));
  const previousPending = truncateMoney(
    Number(receivable.pending_balance ?? 0)
  );
  const previousStatus = receivable.status as ReceivableStatus;
  const paidAmount = truncateMoney(
    Math.max(0, previousTotal - previousPending)
  );
  const newTotal = truncateMoney(Math.max(0, previousTotal - returnTotal));
  const newPending = truncateMoney(Math.max(0, newTotal - paidAmount));
  const overpaid = truncateMoney(Math.max(0, paidAmount - newTotal));
  const nextStatus = resolveReceivableStatus(newTotal, newPending);

  const { error: updateError } = await supabase
    .from("accounts_receivable")
    .update({
      total_amount: newTotal,
      pending_balance: newPending,
      status: nextStatus,
    })
    .eq("id", receivable.id);

  if (updateError) {
    throw new Error(
      `No se pudo actualizar la cuenta corriente: ${updateError.message}`
    );
  }

  const customerCreditIds: string[] = [];

  if (overpaid > 0) {
    const creditSupplierId = await deriveSaleCreditSupplier(supabase, saleId);

    const { data: credit, error: creditError } = await supabase
      .from("customer_credits")
      .insert({
        organization_id: orgId,
        customer_id: customerId,
        supplier_id: creditSupplierId,
        amount: overpaid,
        remaining_amount: overpaid,
        source_payment_id: null,
        notes: `Saldo a favor generado por devolución de venta ${saleId}`,
      })
      .select("id")
      .single();

    if (creditError || !credit?.id) {
      throw new Error(
        `No se pudo generar el crédito a favor del cliente: ${creditError?.message ?? "error desconocido"}`
      );
    }

    customerCreditIds.push(credit.id);
  }

  return {
    receivableId: receivable.id,
    previousTotal,
    previousPending,
    previousStatus,
    customerCreditIds,
  };
}

// ---------------------------------------------------------------------------
// Restock helpers
// ---------------------------------------------------------------------------

type ReceivableRollback = {
  receivableId: string;
  previousTotal: number;
  previousPending: number;
  previousStatus: ReceivableStatus;
  customerCreditIds: string[];
};

type LotWithProduct = {
  id: string;
  product_id: string;
  quantity_available: number;
  unit_quantity_available: number | null;
  lot_number: string;
  expiration_date: string;
};

type RestockRollback = {
  movementId: string;
  lotId: string;
  previousStock: number;
  previousUnitQuantityAvailable: number | null;
};

async function restockReturnedItems(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  saleId: string;
  returnId: string;
  items: SaleReturnItemInput[];
  restockReason: string;
}): Promise<RestockRollback[]> {
  const { supabase, orgId, saleId, restockReason, items } = params;

  // Get the OUTBOUND movements for this sale (by sale reason patterns)
  const { data: sale } = await supabase
    .from("sales_orders")
    .select(
      "sale_number, invoice_number, customer:customers(fantasy_name, business_name)"
    )
    .eq("id", saleId)
    .eq("organization_id", orgId)
    .maybeSingle();

  const saleNum =
    (sale as { sale_number?: number | null } | null)?.sale_number ?? null;
  const invoiceNum =
    (sale as { invoice_number?: string | null } | null)?.invoice_number ?? null;
  const customer = (
    sale as {
      customer?: {
        fantasy_name?: string | null;
        business_name?: string | null;
      } | null;
    } | null
  )?.customer;
  const customerName =
    customer?.fantasy_name?.trim() || customer?.business_name?.trim() || null;

  const reasonText = formatSaleMovementReason({
    saleId,
    saleNumber: saleNum,
    invoiceNumber: invoiceNum,
    customerName,
  });
  const legacyReason = `Venta confirmada ${saleId}`;

  // Build a robust filter: exact match first, then ILIKE by sale number/invoice
  // prefix to survive customer renames after the sale was confirmed.
  let outboundsQuery = supabase
    .from("stock_movements")
    .select("lot_id, quantity, unit_quantity")
    .eq("organization_id", orgId)
    .eq("type", "OUTBOUND");

  if (saleNum !== null) {
    const prefix = `Venta N${saleNum}`;
    outboundsQuery = outboundsQuery.or(
      `reason.ilike.${prefix} %,reason.eq.${prefix},reason.eq.${legacyReason}`
    );
  } else if (invoiceNum) {
    const prefix = `Venta ${invoiceNum.trim()}`;
    outboundsQuery = outboundsQuery.or(
      `reason.ilike.${prefix} %,reason.eq.${prefix},reason.eq.${legacyReason}`
    );
  } else {
    outboundsQuery = outboundsQuery.in("reason", [reasonText, legacyReason]);
  }

  const { data: outbounds } = await outboundsQuery;

  if (!outbounds?.length) {
    return [];
  }

  const lotIds = [
    ...new Set(
      outbounds.map((m) => m.lot_id).filter((id): id is string => id != null)
    ),
  ];

  const { data: lotsData } = await supabase
    .from("product_lots")
    .select(
      "id, product_id, quantity_available, unit_quantity_available, lot_number, expiration_date"
    )
    .eq("organization_id", orgId)
    .in("id", lotIds);

  if (!lotsData?.length) {
    return [];
  }

  const lotsById = new Map<string, LotWithProduct>(
    lotsData
      .filter(
        (
          l
        ): l is LotWithProduct & {
          id: string;
          product_id: string;
          lot_number: string;
          expiration_date: string;
        } =>
          l.id != null &&
          l.product_id != null &&
          l.lot_number != null &&
          l.expiration_date != null
      )
      .map((l) => [
        l.id,
        {
          id: l.id,
          product_id: l.product_id,
          quantity_available: Number(l.quantity_available ?? 0),
          unit_quantity_available:
            l.unit_quantity_available != null
              ? Number(l.unit_quantity_available)
              : null,
          lot_number: l.lot_number,
          expiration_date: l.expiration_date,
        },
      ])
  );

  const timestamp = new Date().toISOString();
  const rollbacks: RestockRollback[] = [];

  for (const item of items) {
    rollbacks.push(
      ...(await restockSingleItem({
        supabase,
        orgId,
        lotsById,
        outbounds,
        item,
        restockReason,
        timestamp,
      }))
    );
  }

  return rollbacks;
}

function computeLotShare(params: {
  lotOutboundQty: number;
  totalOutboundQty: number;
  totalToReturn: number;
  remaining: number;
  isLast: boolean;
  integer?: boolean; // true for unit counts, false for float kg values
}): number {
  const {
    lotOutboundQty,
    totalOutboundQty,
    totalToReturn,
    remaining,
    isLast,
    integer = false,
  } = params;
  if (isLast) {
    return remaining;
  }
  const raw = (lotOutboundQty / totalOutboundQty) * totalToReturn;
  return Math.min(remaining, integer ? Math.round(raw) : raw);
}

async function applyRestockToLot(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  lot: LotWithProduct;
  lotShare: number;
  unitShare: number | null;
  restockReason: string;
  timestamp: string;
}): Promise<RestockRollback> {
  const {
    supabase,
    orgId,
    lot,
    lotShare,
    unitShare,
    restockReason,
    timestamp,
  } = params;
  const previousStock = lot.quantity_available;
  const previousUnitQuantityAvailable = lot.unit_quantity_available;
  const newStock = previousStock + lotShare;

  const { data: movement, error: movErr } = await supabase
    .from("stock_movements")
    .insert({
      organization_id: orgId,
      lot_id: lot.id,
      type: "INBOUND",
      quantity: lotShare,
      previous_stock: previousStock,
      new_stock: newStock,
      unit_quantity: unitShare,
      reason: restockReason,
    })
    .select("id")
    .single();

  if (movErr || !movement?.id) {
    throw new Error(
      `No se pudo registrar el reingreso de stock: ${movErr?.message ?? "error desconocido"}`
    );
  }

  const updateData: Record<string, unknown> = {
    quantity_available: newStock,
    updated_at: timestamp,
  };
  if (unitShare !== null && lot.unit_quantity_available !== null) {
    updateData.unit_quantity_available =
      (lot.unit_quantity_available ?? 0) + unitShare;
  }

  const { error: lotErr } = await supabase
    .from("product_lots")
    .update(updateData)
    .eq("id", lot.id);

  if (lotErr) {
    await supabase.from("stock_movements").delete().eq("id", movement.id);
    throw new Error(
      `No se pudo actualizar el lote de stock: ${lotErr.message}`
    );
  }

  lot.quantity_available = newStock;
  if (unitShare !== null && lot.unit_quantity_available !== null) {
    lot.unit_quantity_available =
      (lot.unit_quantity_available ?? 0) + unitShare;
  }

  return {
    movementId: movement.id,
    lotId: lot.id,
    previousStock,
    previousUnitQuantityAvailable,
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: orchestrates proportional multi-lot restock intentionally
async function restockSingleItem(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  lotsById: Map<string, LotWithProduct>;
  outbounds: Array<{
    lot_id: string | null;
    quantity: number | null;
    unit_quantity: number | null;
  }>;
  item: SaleReturnItemInput;
  restockReason: string;
  timestamp: string;
}): Promise<RestockRollback[]> {
  const {
    supabase,
    orgId,
    lotsById,
    outbounds,
    item,
    restockReason,
    timestamp,
  } = params;

  const itemOutbounds = outbounds.filter(
    (m) =>
      m.lot_id != null && lotsById.get(m.lot_id)?.product_id === item.productId
  );

  if (!itemOutbounds.length) {
    return [];
  }

  const totalOutbound = itemOutbounds.reduce(
    (acc, m) => acc + (m.quantity ?? 0),
    0
  );
  if (totalOutbound <= 0) {
    return [];
  }

  const totalUnitOutbound = itemOutbounds.reduce(
    (acc, m) => acc + (m.unit_quantity ?? 0),
    0
  );
  const totalUnitsToReturn =
    item.unitQuantity ??
    (totalUnitOutbound > 0
      ? Math.round((item.quantity / totalOutbound) * totalUnitOutbound)
      : null);

  let remaining = item.quantity;
  let remainingUnits = totalUnitsToReturn;
  const rollbacks: RestockRollback[] = [];

  for (let i = 0; i < itemOutbounds.length; i++) {
    if (remaining <= 0) {
      break;
    }
    const m = itemOutbounds[i];
    if (!m.lot_id) {
      continue;
    }
    const lot = lotsById.get(m.lot_id);
    if (!lot) {
      continue;
    }

    const isLast = i === itemOutbounds.length - 1;
    const lotShare = computeLotShare({
      lotOutboundQty: m.quantity ?? 0,
      totalOutboundQty: totalOutbound,
      totalToReturn: item.quantity,
      remaining,
      isLast,
    });

    if (lotShare <= 0) {
      continue;
    }

    let unitShare: number | null = null;
    if (totalUnitsToReturn !== null && remainingUnits !== null) {
      unitShare = computeLotShare({
        lotOutboundQty: m.unit_quantity ?? 0,
        totalOutboundQty: totalUnitOutbound,
        totalToReturn: totalUnitsToReturn,
        remaining: remainingUnits,
        isLast,
        integer: true,
      });
      remainingUnits -= unitShare;
    }

    rollbacks.push(
      await applyRestockToLot({
        supabase,
        orgId,
        lot,
        lotShare,
        unitShare,
        restockReason,
        timestamp,
      })
    );
    remaining -= lotShare;
  }

  return rollbacks;
}

async function cleanupRestock(params: {
  supabase: SupabaseServerClient;
  restockRollbacks: RestockRollback[];
}): Promise<void> {
  for (const rollback of params.restockRollbacks.toReversed()) {
    await params.supabase
      .from("stock_movements")
      .delete()
      .eq("id", rollback.movementId);

    const updateData: Record<string, unknown> = {
      quantity_available: rollback.previousStock,
    };
    if (rollback.previousUnitQuantityAvailable !== null) {
      updateData.unit_quantity_available =
        rollback.previousUnitQuantityAvailable;
    }

    await params.supabase
      .from("product_lots")
      .update(updateData)
      .eq("id", rollback.lotId);
  }
}

async function cleanupReceivable(params: {
  supabase: SupabaseServerClient;
  rollback: ReceivableRollback | null;
}): Promise<void> {
  if (!params.rollback) {
    return;
  }

  if (params.rollback.customerCreditIds.length) {
    await params.supabase
      .from("customer_credits")
      .delete()
      .in("id", params.rollback.customerCreditIds);
  }

  await params.supabase
    .from("accounts_receivable")
    .update({
      total_amount: params.rollback.previousTotal,
      pending_balance: params.rollback.previousPending,
      status: params.rollback.previousStatus,
    })
    .eq("id", params.rollback.receivableId);
}

async function cleanupReturnCreditNotes(params: {
  supabase: SupabaseServerClient;
  returnId: string;
}): Promise<void> {
  const { data: creditNotes } = await params.supabase
    .from("credit_notes")
    .select("id")
    .eq("sales_return_id", params.returnId);

  const creditNoteIds = (creditNotes ?? []).map((note) => note.id);
  if (!creditNoteIds.length) {
    return;
  }

  await params.supabase
    .from("customer_credits")
    .delete()
    .in("credit_note_id", creditNoteIds);
  await params.supabase.from("credit_notes").delete().in("id", creditNoteIds);
}

async function cleanupSaleReturnCreation(params: {
  supabase: SupabaseServerClient;
  returnId: string;
  restockRollbacks: RestockRollback[];
  receivableRollback: ReceivableRollback | null;
}): Promise<void> {
  await cleanupReturnCreditNotes({
    supabase: params.supabase,
    returnId: params.returnId,
  });
  await cleanupReceivable({
    supabase: params.supabase,
    rollback: params.receivableRollback,
  });
  await cleanupRestock({
    supabase: params.supabase,
    restockRollbacks: params.restockRollbacks,
  });
  await params.supabase
    .from("sales_return_items")
    .delete()
    .eq("sales_return_id", params.returnId);
  await params.supabase
    .from("sales_returns")
    .delete()
    .eq("id", params.returnId);
}

function createCreditNoteForReturn(params: {
  orgSlug: string;
  saleId: string;
  returnTotal: number;
  reason: string;
  returnId: string;
  lines: ResolvedSaleReturnLine[];
  insertedReturnItems: Array<{
    id: string;
    sales_order_item_id: string | null;
  }>;
  taxes: ReturnType<typeof buildCreditNoteTaxesFromReturn>;
  sale: SaleReturnSourceSale;
}): Promise<CreateCreditNoteResult> {
  return createCreditNote({
    orgSlug: params.orgSlug,
    salesOrderId: params.saleId,
    amount: params.returnTotal,
    observations: params.reason,
    salesReturnId: params.returnId,
    originType: "RETURN",
    reason: params.reason,
    items: buildCreditNoteItemsFromReturn({
      saleId: params.saleId,
      lines: params.lines,
      insertedReturnItems: params.insertedReturnItems,
    }),
    itemTaxes: buildCreditNoteItemTaxesFromReturn(params.lines),
    taxes: params.taxes,
    sourceDocuments: buildCreditNoteSourceDocumentsFromReturn({
      saleId: params.saleId,
      sale: params.sale,
      returnTotal: params.returnTotal,
    }),
  });
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: orchestrates return validation, stock, AR and optional NC generation.
export async function createSaleReturn(
  input: CreateSaleReturnInput
): Promise<CreateSaleReturnResult> {
  const {
    orgSlug,
    saleId,
    reason,
    notes,
    items,
    additionalCreditAmount = 0,
  } = input;
  const shouldCreateCreditNote = Boolean(
    input.emitCreditNote || input.requireCreditNote
  );

  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();
  const accessContext = await getSalesAccessContext(orgSlug);

  if (!accessContext.canManage) {
    throw new Error("No tenés permiso para registrar devoluciones");
  }

  const { data: saleData, error: saleError } = await supabase
    .from("sales_orders")
    .select(
      `
      id,
      status,
      customer_id,
      total_amount,
      sub_total,
      global_discount_amount,
      invoice_type,
      invoice_number,
      sale_date,
      arca_status,
      arca_point_of_sale,
      arca_voucher_number,
      arca_voucher_type_code,
      arca_authorized_at,
      items:sales_order_items(
        id,
        product_id,
        description,
        quantity,
        unit_quantity,
        unit_price,
        base_price,
        discount_amount,
        subtotal,
        product:products(name),
        item_taxes:sales_order_item_taxes(
          id,
          tax_id,
          name,
          rate,
          tax_amount,
          base_amount,
          tax_code_snapshot,
          source
        )
      ),
      taxes:sales_order_taxes(
        id,
        tax_id,
        name,
        rate,
        tax_amount,
        base_amount,
        tax_code_snapshot
      )
    `
    )
    .eq("id", saleId)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (saleError || !saleData) {
    throw new Error("Venta no encontrada");
  }

  const sale = saleData as unknown as SaleReturnSourceSale;

  if (sale.status !== "DISPATCH" && sale.status !== "DELIVERED") {
    throw new Error("Solo se pueden devolver ventas despachadas o entregadas");
  }

  if (!sale.customer_id) {
    throw new Error("La venta no tiene cliente asociado");
  }

  const returnItems = items.filter((i) => i.quantity > 0);
  if (!returnItems.length) {
    throw new Error("Debe indicar al menos un producto a devolver");
  }

  const previouslyReturnedByItemId = await getPreviouslyReturnedQuantities({
    supabase,
    orgId: org.id,
    saleId,
  });
  const resolvedLines = resolveReturnLines({
    sale,
    returnItems,
    previouslyReturnedByItemId,
  });
  const returnedNetAmount = truncateMoney(
    resolvedLines.reduce((acc, line) => acc + line.netAmount, 0)
  );
  const creditNoteTaxes = buildCreditNoteTaxesFromReturn({
    sale,
    returnedNetAmount,
    lines: resolvedLines,
  });
  const returnTotal = truncateMoney(
    resolvedLines.reduce((acc, line) => acc + line.totalAmount, 0)
  );
  const adjustedReturnTotal = truncateMoney(
    returnTotal + Math.max(0, Number(additionalCreditAmount) || 0)
  );

  const { data: returnRecord, error: returnError } = await supabase
    .from("sales_returns")
    .insert({
      organization_id: org.id,
      sales_order_id: saleId,
      customer_id: sale.customer_id,
      reason,
      notes: notes ?? null,
      status: "RECEIVED",
      resolution: shouldCreateCreditNote ? "CREDIT" : "RESTOCK",
      return_date: new Date().toISOString().split("T")[0],
      received_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (returnError || !returnRecord) {
    throw new Error(
      `No se pudo registrar la devolución: ${returnError?.message ?? "error desconocido"}`
    );
  }

  const returnId = returnRecord.id;
  let restockRollbacks: RestockRollback[] = [];
  let receivableRollback: ReceivableRollback | null = null;

  try {
    const { data: insertedReturnItems, error: itemsError } = await supabase
      .from("sales_return_items")
      .insert(
        resolvedLines.map((line) => ({
          organization_id: org.id,
          sales_return_id: returnId,
          sales_order_item_id: line.input.salesOrderItemId,
          product_id: line.input.productId,
          quantity: line.quantity,
          unit_price: line.unitPrice,
          unit_quantity: line.unitQuantity ?? 0,
          credit_amount: line.totalAmount,
          restock: line.restock,
          item_condition: line.itemCondition,
        }))
      )
      .select("id, sales_order_item_id");

    if (itemsError) {
      throw new Error(
        `No se pudieron registrar los ítems: ${itemsError.message}`
      );
    }

    const restockReason = `Devolución (${returnId})`;

    const itemsToRestock = resolvedLines
      .filter((line) => line.restock)
      .map((line) => ({
        ...line.input,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        restock: true,
        unitQuantity: line.unitQuantity,
      }));
    if (itemsToRestock.length > 0) {
      restockRollbacks = await restockReturnedItems({
        supabase,
        orgId: org.id,
        saleId,
        returnId,
        items: itemsToRestock,
        restockReason,
      });
    }

    receivableRollback = await updateReceivableForReturn({
      supabase,
      orgId: org.id,
      saleId,
      customerId: sale.customer_id,
      returnTotal: adjustedReturnTotal,
    });

    const creditNoteResult = shouldCreateCreditNote
      ? await createCreditNoteForReturn({
          orgSlug,
          saleId,
          returnTotal: adjustedReturnTotal,
          reason,
          returnId,
          lines: resolvedLines,
          insertedReturnItems: insertedReturnItems ?? [],
          taxes: creditNoteTaxes,
          sale,
        })
      : null;

    return {
      returnId,
      returnTotal,
      creditNoteId: creditNoteResult?.creditNoteId ?? null,
      creditNoteNumber: creditNoteResult?.creditNoteNumber ?? null,
    };
  } catch (error) {
    await cleanupSaleReturnCreation({
      supabase,
      returnId,
      restockRollbacks,
      receivableRollback,
    });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Query helpers for the return page
// ---------------------------------------------------------------------------

export async function getReturnedQuantitiesBySaleId(
  orgSlug: string,
  saleId: string
): Promise<Record<string, number>> {
  const totals = await getReturnedQuantityTotalsBySaleId(orgSlug, saleId);
  return totals.quantities;
}

export async function getReturnedQuantityTotalsBySaleId(
  orgSlug: string,
  saleId: string
): Promise<{
  quantities: Record<string, number>;
  unitQuantities: Record<string, number>;
}> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return { quantities: {}, unitQuantities: {} };
  }

  const supabase = await createClient();

  const { data: returns } = await supabase
    .from("sales_returns")
    .select("id")
    .eq("sales_order_id", saleId)
    .eq("organization_id", org.id);

  if (!returns?.length) {
    return { quantities: {}, unitQuantities: {} };
  }

  const returnIds = returns.map((r) => r.id);
  const { data: items } = await supabase
    .from("sales_return_items")
    .select("sales_order_item_id, quantity, unit_quantity")
    .in("sales_return_id", returnIds);

  const quantities: Record<string, number> = {};
  const unitQuantities: Record<string, number> = {};
  for (const item of items ?? []) {
    if (item.sales_order_item_id) {
      quantities[item.sales_order_item_id] =
        (quantities[item.sales_order_item_id] ?? 0) + (item.quantity ?? 0);
      unitQuantities[item.sales_order_item_id] =
        (unitQuantities[item.sales_order_item_id] ?? 0) +
        (item.unit_quantity ?? 0);
    }
  }
  return { quantities, unitQuantities };
}

export async function getReturnCreditNoteTotalBySaleId(
  orgSlug: string,
  saleId: string
): Promise<number> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return 0;
  }

  const supabase = await createClient();

  const { data: returns } = await supabase
    .from("sales_returns")
    .select("id")
    .eq("sales_order_id", saleId)
    .eq("organization_id", org.id);

  const returnIds = (returns ?? []).map((row) => row.id);
  if (!returnIds.length) {
    return 0;
  }

  const { data: creditNotes } = await supabase
    .from("credit_notes")
    .select("amount")
    .eq("organization_id", org.id)
    .eq("origin_type", "RETURN")
    .neq("status", "CANCELLED")
    .in("sales_return_id", returnIds);

  return truncateMoney(
    (creditNotes ?? []).reduce(
      (total, creditNote) => total + Number(creditNote.amount ?? 0),
      0
    )
  );
}

export type SaleReturnItemSummary = {
  productName: string;
  quantity: number;
  creditAmount: number;
};

export type SaleReturnSummary = {
  id: string;
  return_date: string;
  reason: string;
  total: number;
  items: SaleReturnItemSummary[];
};

export async function getSaleReturnsSummary(
  orgSlug: string,
  saleId: string
): Promise<SaleReturnSummary[]> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return [];
  }

  const supabase = await createClient();

  const { data } = await supabase
    .from("sales_returns")
    .select(
      `id, return_date, reason,
       sales_return_items(quantity, credit_amount, products(name))`
    )
    .eq("sales_order_id", saleId)
    .eq("organization_id", org.id)
    .order("return_date", { ascending: false });

  if (!data?.length) {
    return [];
  }

  return data.map((ret) => {
    const items = (ret.sales_return_items ?? []).map((sri) => ({
      productName:
        (sri.products as { name?: string | null } | null)?.name ?? "Producto",
      quantity: sri.quantity ?? 0,
      creditAmount: Number(sri.credit_amount ?? 0),
    }));
    const total = items.reduce((acc, i) => acc + i.creditAmount, 0);
    return {
      id: ret.id,
      return_date: ret.return_date ?? "",
      reason: ret.reason ?? "",
      total,
      items,
    };
  });
}

export type SaleForReturn = Pick<
  SalesOrderDetail,
  | "id"
  | "status"
  | "sale_number"
  | "invoice_number"
  | "invoice_type"
  | "sale_date"
  | "customer"
  | "items"
  | "total_amount"
  | "sub_total"
  | "receivable"
>;

import { truncateMoney } from "@/lib/decimal";
import { createClient } from "@/lib/supabase/server";
import { createCreditNote } from "@/modules/credit-notes/service/credit-notes.service";
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

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type SaleReturnItemInput = {
  salesOrderItemId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  restock: boolean;
  unitQuantity?: number;
};

export type CreateSaleReturnInput = {
  orgSlug: string;
  saleId: string;
  reason: string;
  notes?: string | null;
  items: SaleReturnItemInput[];
  emitCreditNote?: boolean;
};

export type CreateSaleReturnResult = {
  returnId: string;
  returnTotal: number;
  creditNoteNumber?: string | null;
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

async function updateReceivableForReturn(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  saleId: string;
  customerId: string;
  returnTotal: number;
}): Promise<void> {
  const { supabase, orgId, saleId, customerId, returnTotal } = params;

  const { data: receivable } = await supabase
    .from("accounts_receivable")
    .select("id, total_amount, pending_balance")
    .eq("sales_order_id", saleId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!receivable?.id) {
    return;
  }

  const previousTotal = truncateMoney(Number(receivable.total_amount ?? 0));
  const previousPending = truncateMoney(
    Number(receivable.pending_balance ?? 0)
  );
  const paidAmount = truncateMoney(
    Math.max(0, previousTotal - previousPending)
  );
  const newTotal = truncateMoney(Math.max(0, previousTotal - returnTotal));
  const newPending = truncateMoney(Math.max(0, newTotal - paidAmount));
  const overpaid = truncateMoney(Math.max(0, paidAmount - newTotal));
  const nextStatus = resolveReceivableStatus(newTotal, newPending);

  await supabase
    .from("accounts_receivable")
    .update({
      total_amount: newTotal,
      pending_balance: newPending,
      status: nextStatus,
    })
    .eq("id", receivable.id);

  if (overpaid > 0) {
    const creditSupplierId = await deriveSaleCreditSupplier(supabase, saleId);

    await supabase.from("customer_credits").insert({
      organization_id: orgId,
      customer_id: customerId,
      supplier_id: creditSupplierId,
      amount: overpaid,
      remaining_amount: overpaid,
      source_payment_id: null,
      notes: `Saldo a favor generado por devolución de venta ${saleId}`,
    });
  }
}

// ---------------------------------------------------------------------------
// Restock helpers
// ---------------------------------------------------------------------------

type LotWithProduct = {
  id: string;
  product_id: string;
  quantity_available: number;
  unit_quantity_available: number | null;
  lot_number: string;
  expiration_date: string;
};

async function restockReturnedItems(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  saleId: string;
  returnId: string;
  items: SaleReturnItemInput[];
  restockReason: string;
}): Promise<void> {
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
    return;
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
    return;
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

  for (const item of items) {
    await restockSingleItem({
      supabase,
      orgId,
      lotsById,
      outbounds,
      item,
      restockReason,
      timestamp,
    });
  }
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
}): Promise<void> {
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
  const newStock = previousStock + lotShare;

  const { error: movErr } = await supabase.from("stock_movements").insert({
    organization_id: orgId,
    lot_id: lot.id,
    type: "INBOUND",
    quantity: lotShare,
    previous_stock: previousStock,
    new_stock: newStock,
    unit_quantity: unitShare,
    reason: restockReason,
  });

  if (movErr) {
    throw new Error(
      `No se pudo registrar el reingreso de stock: ${movErr.message}`
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
    throw new Error(
      `No se pudo actualizar el lote de stock: ${lotErr.message}`
    );
  }

  lot.quantity_available = newStock;
  if (unitShare !== null && lot.unit_quantity_available !== null) {
    lot.unit_quantity_available =
      (lot.unit_quantity_available ?? 0) + unitShare;
  }
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
}): Promise<void> {
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
    return;
  }

  const totalOutbound = itemOutbounds.reduce(
    (acc, m) => acc + (m.quantity ?? 0),
    0
  );
  if (totalOutbound <= 0) {
    return;
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

    await applyRestockToLot({
      supabase,
      orgId,
      lot,
      lotShare,
      unitShare,
      restockReason,
      timestamp,
    });
    remaining -= lotShare;
  }
}

async function tryCreateCreditNote(params: {
  orgSlug: string;
  saleId: string;
  returnTotal: number;
  reason: string;
  returnId: string;
}): Promise<string | null> {
  try {
    const result = await createCreditNote({
      orgSlug: params.orgSlug,
      salesOrderId: params.saleId,
      amount: params.returnTotal,
      observations: params.reason,
      salesReturnId: params.returnId,
    });
    return result.creditNoteNumber;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function createSaleReturn(
  input: CreateSaleReturnInput
): Promise<CreateSaleReturnResult> {
  const { orgSlug, saleId, reason, notes, items, emitCreditNote } = input;

  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();
  const accessContext = await getSalesAccessContext(orgSlug);

  if (!accessContext.canManage) {
    throw new Error("No tenés permiso para registrar devoluciones");
  }

  const { data: sale, error: saleError } = await supabase
    .from("sales_orders")
    .select("id, status, customer_id, total_amount")
    .eq("id", saleId)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (saleError || !sale) {
    throw new Error("Venta no encontrada");
  }

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

  const returnTotal = truncateMoney(
    returnItems.reduce((acc, i) => acc + i.quantity * i.unitPrice, 0)
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
      resolution: "RESTOCK",
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

  const { error: itemsError } = await supabase
    .from("sales_return_items")
    .insert(
      returnItems.map((i) => ({
        organization_id: org.id,
        sales_return_id: returnId,
        sales_order_item_id: i.salesOrderItemId,
        product_id: i.productId,
        quantity: i.quantity,
        unit_price: i.unitPrice,
        credit_amount: truncateMoney(i.quantity * i.unitPrice),
        restock: i.restock,
      }))
    );

  if (itemsError) {
    throw new Error(
      `No se pudieron registrar los ítems: ${itemsError.message}`
    );
  }

  const restockReason = `Devolución (${returnId})`;

  const itemsToRestock = returnItems.filter((i) => i.restock);
  if (itemsToRestock.length > 0) {
    await restockReturnedItems({
      supabase,
      orgId: org.id,
      saleId,
      returnId,
      items: itemsToRestock,
      restockReason,
    });
  }

  await updateReceivableForReturn({
    supabase,
    orgId: org.id,
    saleId,
    customerId: sale.customer_id,
    returnTotal,
  });

  const creditNoteNumber = emitCreditNote
    ? await tryCreateCreditNote({
        orgSlug,
        saleId,
        returnTotal,
        reason,
        returnId,
      })
    : null;

  return { returnId, returnTotal, creditNoteNumber };
}

// ---------------------------------------------------------------------------
// Query helpers for the return page
// ---------------------------------------------------------------------------

export async function getReturnedQuantitiesBySaleId(
  orgSlug: string,
  saleId: string
): Promise<Record<string, number>> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return {};
  }

  const supabase = await createClient();

  const { data: returns } = await supabase
    .from("sales_returns")
    .select("id")
    .eq("sales_order_id", saleId)
    .eq("organization_id", org.id);

  if (!returns?.length) {
    return {};
  }

  const returnIds = returns.map((r) => r.id);
  const { data: items } = await supabase
    .from("sales_return_items")
    .select("sales_order_item_id, quantity")
    .in("sales_return_id", returnIds);

  const result: Record<string, number> = {};
  for (const item of items ?? []) {
    if (item.sales_order_item_id) {
      result[item.sales_order_item_id] =
        (result[item.sales_order_item_id] ?? 0) + (item.quantity ?? 0);
    }
  }
  return result;
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

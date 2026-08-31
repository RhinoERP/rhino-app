import { truncateMoney, truncateToDecimals } from "@/lib/decimal";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { Database } from "@/types/supabase";
import type {
  GetPosSaleReturnableItemsResult,
  PosSaleReturnRefundMethod,
  ProcessPosSaleReturnInput,
  ProcessPosSaleReturnItemInput,
  ProcessPosSaleReturnResult,
} from "../types";
import { processPosSaleReturnSchema } from "../types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type PosSaleRaw = Database["public"]["Tables"]["pos_sales"]["Row"] & {
  items?: Database["public"]["Tables"]["pos_sale_items"]["Row"][] | null;
  payments?: Database["public"]["Tables"]["pos_payments"]["Row"][] | null;
};

type PosSaleWithProductRaw =
  Database["public"]["Tables"]["pos_sales"]["Row"] & {
    items?:
      | (Database["public"]["Tables"]["pos_sale_items"]["Row"] & {
          product?: {
            id?: string | null;
            name?: string | null;
            sku?: string | null;
            tracks_stock_units?: boolean | null;
            unit_of_measure?: string | null;
          } | null;
        })[]
      | null;
  };

type PostgrestLikeError = {
  code?: string | null;
  message?: string | null;
};

type NormalizedReturnLineInput = {
  posSaleItemId: string;
  quantity: number;
  unitQuantity: number | null;
  reason: string | null;
};

type ResolvedReturnLine = {
  posSaleItemId: string;
  productId: string;
  lotId: string | null;
  quantity: number;
  unitPrice: number;
  subtotalAmount: number;
  discountAmount: number;
  reason: string | null;
  unitQuantity: number | null;
};

type MutableLotState = {
  id: string;
  productId: string;
  lotNumber: string;
  expirationDate: string;
  quantityAvailable: number;
  unitQuantityAvailable: number | null;
};

type StockReversalContext = {
  lotUpdates: Database["public"]["Tables"]["product_lots"]["Insert"][];
  rollbackLotUpdates: Database["public"]["Tables"]["product_lots"]["Insert"][];
  movementPayloads: Database["public"]["Tables"]["stock_movements"]["Insert"][];
};

const POS_SALES_RETURNS_TABLE = "pos_sales_returns" as "pos_sales";
const POS_SALES_RETURN_ITEMS_TABLE =
  "pos_sales_return_items" as "pos_sale_items";
const QUANTITY_DECIMALS = 6;
const STOCK_EPSILON = 0.000_001;
const RETURNS_SCHEMA_HINT =
  "Faltan migraciones para devoluciones POS. Aplica las tablas pos_sales_returns y pos_sales_return_items antes de usar esta acción.";

function truncateQuantity(value: number): number {
  return truncateToDecimals(value, QUANTITY_DECIMALS);
}

function sanitizeText(value?: string | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toReturnDateTime(value?: string | null): string {
  if (!value) {
    return new Date().toISOString();
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return new Date().toISOString();
  }

  const withTime = trimmed.includes("T") ? trimmed : `${trimmed}T12:00:00`;
  const parsed = new Date(withTime);

  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }

  return parsed.toISOString();
}

function normalizeForComparison(value?: string | null): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("_", " ")
    .trim()
    .toLowerCase();
}

function isCashPaymentMethod(paymentMethod?: string | null): boolean {
  const normalized = normalizeForComparison(paymentMethod);
  return normalized === "cash" || normalized === "efectivo";
}

function isCardPaymentMethod(paymentMethod?: string | null): boolean {
  const normalized = normalizeForComparison(paymentMethod);
  return (
    normalized.includes("card") ||
    normalized.includes("tarjeta") ||
    normalized.includes("credito") ||
    normalized.includes("debito")
  );
}

function isBankPaymentMethod(paymentMethod?: string | null): boolean {
  const normalized = normalizeForComparison(paymentMethod);
  return (
    normalized.includes("transfer") ||
    normalized.includes("cheque") ||
    normalized.includes("deposito") ||
    normalized.includes("e cheq") ||
    normalized.includes("echeq")
  );
}

function isReturnsSchemaError(error: PostgrestLikeError): boolean {
  const normalizedMessage = String(error.message ?? "").toLowerCase();

  if (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205"
  ) {
    return true;
  }

  const referencesReturnsTables =
    normalizedMessage.includes("pos_sales_returns") ||
    normalizedMessage.includes("pos_sales_return_items");

  return (
    referencesReturnsTables &&
    (normalizedMessage.includes("does not exist") ||
      normalizedMessage.includes("could not find the table") ||
      normalizedMessage.includes("column") ||
      normalizedMessage.includes("relation"))
  );
}

function resolveSchemaAwareErrorMessage(
  error: PostgrestLikeError,
  fallback: string
): string {
  if (isReturnsSchemaError(error)) {
    return RETURNS_SCHEMA_HINT;
  }

  return error.message ?? fallback;
}

function resolveReceivableStatus(
  totalAmount: number,
  pendingBalance: number
): Database["public"]["Enums"]["receivable_status"] {
  if (pendingBalance <= 0) {
    return "PAID";
  }

  if (pendingBalance < totalAmount) {
    return "PARTIALLY_PAID";
  }

  return "PENDING";
}

function resolvePosSaleReference(posSale: PosSaleRaw): string {
  const receiptNumber = sanitizeText(posSale.receipt_number);
  return receiptNumber ?? posSale.id;
}

function mergeUnitQuantities(
  current: number | null,
  incoming: number | null
): number | null {
  if (current !== null && incoming !== null) {
    return truncateQuantity(current + incoming);
  }
  return incoming ?? current;
}

function normalizeRequestedItems(
  items: ProcessPosSaleReturnItemInput[]
): NormalizedReturnLineInput[] {
  const mergedByItemId = new Map<string, NormalizedReturnLineInput>();

  for (const rawItem of items) {
    const posSaleItemId = rawItem.posSaleItemId.trim();
    const requestedQuantity = truncateQuantity(Number(rawItem.quantity));
    const normalizedUnitQuantity =
      rawItem.unitQuantity !== null && rawItem.unitQuantity !== undefined
        ? truncateQuantity(Math.max(0, Number(rawItem.unitQuantity)))
        : null;

    if (!posSaleItemId) {
      throw new Error("Uno de los ítems a devolver no tiene ID de ítem POS.");
    }

    if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
      throw new Error(
        "Uno de los ítems tiene cantidad inválida para la devolución."
      );
    }

    const current = mergedByItemId.get(posSaleItemId);
    const reason = sanitizeText(rawItem.reason);

    if (current) {
      mergedByItemId.set(posSaleItemId, {
        posSaleItemId,
        quantity: truncateQuantity(current.quantity + requestedQuantity),
        unitQuantity: mergeUnitQuantities(
          current.unitQuantity,
          normalizedUnitQuantity
        ),
        reason: current.reason ?? reason,
      });
      continue;
    }

    mergedByItemId.set(posSaleItemId, {
      posSaleItemId,
      quantity: requestedQuantity,
      unitQuantity: normalizedUnitQuantity,
      reason,
    });
  }

  return Array.from(mergedByItemId.values());
}

async function getCurrentUserId(
  supabase: SupabaseServerClient
): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw new Error(
      `No se pudo obtener el usuario autenticado: ${error.message}`
    );
  }

  if (!user?.id) {
    throw new Error("Sesión inválida. Inicia sesión nuevamente.");
  }

  return user.id;
}

function resolveRefundMethodFromPayment(
  paymentMethod?: string | null
): PosSaleReturnRefundMethod {
  if (isCashPaymentMethod(paymentMethod)) {
    return "cash";
  }

  if (isCardPaymentMethod(paymentMethod)) {
    return "card";
  }

  if (isBankPaymentMethod(paymentMethod)) {
    return "bank_transfer";
  }

  return "cash";
}

function resolveLinkedReceivableId(
  payments: Database["public"]["Tables"]["pos_payments"]["Row"][] | null
): string | null {
  for (const payment of payments ?? []) {
    if (payment.generated_receivable_id) {
      return payment.generated_receivable_id;
    }
  }

  return null;
}

function resolveEffectiveRefundMethod(params: {
  requestedMethod: PosSaleReturnRefundMethod | null;
  payments: Database["public"]["Tables"]["pos_payments"]["Row"][] | null;
  linkedReceivableId: string | null;
}): PosSaleReturnRefundMethod {
  const { requestedMethod, payments, linkedReceivableId } = params;

  if (requestedMethod && requestedMethod !== "original_payment") {
    return requestedMethod;
  }

  if (linkedReceivableId) {
    return "accounts_receivable";
  }

  const paymentMethod = payments?.[0]?.payment_method
    ? String(payments[0].payment_method)
    : null;

  return resolveRefundMethodFromPayment(paymentMethod);
}

async function getReturnedQuantityBySaleItemId(params: {
  supabase: SupabaseServerClient;
  posSaleId: string;
}): Promise<Map<string, number>> {
  const { data, error } = await params.supabase
    .from(POS_SALES_RETURN_ITEMS_TABLE)
    .select("pos_sale_item_id, quantity, pos_sale_id")
    .eq("pos_sale_id", params.posSaleId);

  if (error) {
    throw new Error(
      resolveSchemaAwareErrorMessage(
        error,
        "No se pudieron obtener devoluciones previas de la venta POS."
      )
    );
  }

  const returnedByItem = new Map<string, number>();
  const rows = (data ?? []) as Array<{
    pos_sale_item_id?: string | null;
    quantity?: number | null;
  }>;

  for (const row of rows) {
    const posSaleItemId = row.pos_sale_item_id ?? null;

    if (!posSaleItemId) {
      continue;
    }

    const quantity = truncateQuantity(Math.max(0, Number(row.quantity ?? 0)));

    returnedByItem.set(
      posSaleItemId,
      truncateQuantity((returnedByItem.get(posSaleItemId) ?? 0) + quantity)
    );
  }

  return returnedByItem;
}

type PosSaleReturnTotals = {
  totalReturnedAmount: number;
  totalRefundedAmount: number;
  totalCreditedAmount: number;
};

async function getPosSaleReturnTotals(params: {
  supabase: SupabaseServerClient;
  posSaleId: string;
}): Promise<PosSaleReturnTotals> {
  const { data, error } = await params.supabase
    .from(POS_SALES_RETURNS_TABLE)
    .select("total_amount, refund_amount, credit_note_amount, pos_sale_id")
    .eq("pos_sale_id", params.posSaleId);

  if (error) {
    throw new Error(
      resolveSchemaAwareErrorMessage(
        error,
        "No se pudieron obtener totales de devoluciones previas de la venta POS."
      )
    );
  }

  let totalReturnedAmount = 0;
  let totalRefundedAmount = 0;
  let totalCreditedAmount = 0;

  for (const row of (data ?? []) as Array<{
    total_amount?: number | null;
    refund_amount?: number | null;
    credit_note_amount?: number | null;
  }>) {
    totalReturnedAmount = truncateMoney(
      totalReturnedAmount + Math.max(0, Number(row.total_amount ?? 0))
    );
    totalRefundedAmount = truncateMoney(
      totalRefundedAmount + Math.max(0, Number(row.refund_amount ?? 0))
    );
    totalCreditedAmount = truncateMoney(
      totalCreditedAmount + Math.max(0, Number(row.credit_note_amount ?? 0))
    );
  }

  return {
    totalReturnedAmount,
    totalRefundedAmount,
    totalCreditedAmount,
  };
}

type PosSaleSubtotalCarrier = {
  subtotal?: number | null;
  discount_amount?: number | null;
};

type PosSaleDiscountDistribution = {
  itemSubtotalTotal: number;
  globalDiscountAmount: number;
};

function resolvePosSaleDiscountDistribution(
  saleDiscountAmount: number,
  items: PosSaleSubtotalCarrier[]
): PosSaleDiscountDistribution {
  const itemSubtotalTotal = truncateMoney(
    items.reduce(
      (sum, item) =>
        sum + truncateMoney(Math.max(0, Number(item.subtotal ?? 0))),
      0
    )
  );
  const lineDiscountTotal = truncateMoney(
    items.reduce(
      (sum, item) =>
        sum + truncateMoney(Math.max(0, Number(item.discount_amount ?? 0))),
      0
    )
  );
  const rawGlobalDiscount = truncateMoney(
    Math.max(0, saleDiscountAmount - lineDiscountTotal)
  );
  const globalDiscountAmount = truncateMoney(
    Math.max(0, Math.min(itemSubtotalTotal, rawGlobalDiscount))
  );

  return {
    itemSubtotalTotal,
    globalDiscountAmount,
  };
}

function resolveItemGlobalDiscountShare(params: {
  itemSubtotal: number;
  distribution: PosSaleDiscountDistribution;
}): number {
  const { itemSubtotal, distribution } = params;

  if (
    itemSubtotal <= STOCK_EPSILON ||
    distribution.globalDiscountAmount <= STOCK_EPSILON ||
    distribution.itemSubtotalTotal <= STOCK_EPSILON
  ) {
    return 0;
  }

  return truncateMoney(
    (distribution.globalDiscountAmount * itemSubtotal) /
      distribution.itemSubtotalTotal
  );
}

export async function getPosSaleReturnableItems(params: {
  orgSlug: string;
  posSaleId: string;
}): Promise<GetPosSaleReturnableItemsResult> {
  const org = await getOrganizationBySlug(params.orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada.");
  }

  const supabase = await createClient();

  const { data: saleData, error: saleError } = await supabase
    .from("pos_sales")
    .select(`
      id,
      customer_id,
      receipt_number,
      sale_date,
      status,
      subtotal_amount,
      discount_amount,
      total_amount,
      items:pos_sale_items(
        id,
        product_id,
        lot_id,
        quantity,
        unit_price,
        subtotal,
        discount_amount,
        product:products(id, name, sku, tracks_stock_units, unit_of_measure)
      )
    `)
    .eq("organization_id", org.id)
    .eq("id", params.posSaleId)
    .maybeSingle();

  if (saleError) {
    throw new Error(
      `No se pudo obtener la venta POS para devoluciones: ${saleError.message}`
    );
  }

  if (!saleData?.id) {
    throw new Error("Venta POS no encontrada.");
  }

  const sale = saleData as PosSaleWithProductRaw;
  const normalizedStatus = normalizeForComparison(sale.status);

  if (
    normalizedStatus.includes("cancel") ||
    normalizedStatus.includes("anul")
  ) {
    throw new Error(
      "La venta POS está anulada y no admite nuevas devoluciones."
    );
  }

  const returnedByItemId = await getReturnedQuantityBySaleItemId({
    supabase,
    posSaleId: sale.id,
  });
  const returnTotals = await getPosSaleReturnTotals({
    supabase,
    posSaleId: sale.id,
  });
  const pricingDistribution = resolvePosSaleDiscountDistribution(
    truncateMoney(Math.max(0, Number(sale.discount_amount ?? 0))),
    sale.items ?? []
  );

  const items = (sale.items ?? [])
    .map((item) => {
      if (!(item.id && item.product_id)) {
        return null;
      }

      const soldQuantity = truncateQuantity(
        Math.max(0, Number(item.quantity ?? 0))
      );
      const returnedQuantity = truncateQuantity(
        Math.max(0, returnedByItemId.get(item.id) ?? 0)
      );
      const availableToReturn = truncateQuantity(
        Math.max(0, soldQuantity - returnedQuantity)
      );
      const unitPrice = truncateMoney(
        Math.max(0, Number(item.unit_price ?? 0))
      );
      const soldSubtotalBeforeGlobalDiscount = truncateMoney(
        Math.max(0, Number(item.subtotal ?? 0))
      );
      const itemGlobalDiscountShare = resolveItemGlobalDiscountShare({
        itemSubtotal: soldSubtotalBeforeGlobalDiscount,
        distribution: pricingDistribution,
      });
      const soldSubtotalAfterGlobalDiscount = truncateMoney(
        Math.max(0, soldSubtotalBeforeGlobalDiscount - itemGlobalDiscountShare)
      );
      const subtotalPerUnit =
        soldQuantity > STOCK_EPSILON
          ? soldSubtotalAfterGlobalDiscount / soldQuantity
          : 0;
      const maxReturnAmount = truncateMoney(
        Math.max(
          0,
          Math.min(
            soldSubtotalAfterGlobalDiscount,
            subtotalPerUnit * availableToReturn
          )
        )
      );

      return {
        posSaleItemId: item.id,
        productId: item.product_id,
        productName: item.product?.name ?? "Producto sin nombre",
        productSku: item.product?.sku ?? "",
        lotId: item.lot_id ?? null,
        soldQuantity,
        returnedQuantity,
        availableToReturn,
        unitPrice,
        maxReturnAmount,
        tracksStockUnits: item.product?.tracks_stock_units ?? false,
        unitOfMeasure: item.product?.unit_of_measure ?? null,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => a.productName.localeCompare(b.productName, "es"));

  return {
    sale: {
      posSaleId: sale.id,
      receiptNumber: sanitizeText(sale.receipt_number),
      saleDate: sale.sale_date ?? null,
      status: sale.status ?? null,
      customerId: sale.customer_id ?? null,
      totalAmount: truncateMoney(Math.max(0, Number(sale.total_amount ?? 0))),
      totalReturnedAmount: returnTotals.totalReturnedAmount,
      totalRefundedAmount: returnTotals.totalRefundedAmount,
      pendingReturnableAmount: truncateMoney(
        Math.max(
          0,
          Number(sale.total_amount ?? 0) - returnTotals.totalReturnedAmount
        )
      ),
    },
    items,
  };
}

function resolveReturnLines(params: {
  requestedItems: NormalizedReturnLineInput[];
  saleItems: Database["public"]["Tables"]["pos_sale_items"]["Row"][];
  returnedByItemId: Map<string, number>;
  saleDiscountAmount: number;
}): ResolvedReturnLine[] {
  const pricingDistribution = resolvePosSaleDiscountDistribution(
    truncateMoney(Math.max(0, params.saleDiscountAmount)),
    params.saleItems
  );
  const saleItemsById = new Map<
    string,
    Database["public"]["Tables"]["pos_sale_items"]["Row"]
  >();

  for (const item of params.saleItems) {
    if (item.id) {
      saleItemsById.set(item.id, item);
    }
  }

  return params.requestedItems.map((requestedLine) => {
    const saleItem = saleItemsById.get(requestedLine.posSaleItemId);

    if (!saleItem?.id) {
      throw new Error(
        `El ítem ${requestedLine.posSaleItemId} no pertenece a la venta POS seleccionada.`
      );
    }

    if (!saleItem.product_id) {
      throw new Error(
        `El ítem ${saleItem.id} no tiene un producto asociado y no se puede devolver.`
      );
    }

    const soldQuantity = truncateQuantity(
      Math.max(0, Number(saleItem.quantity))
    );
    const returnedQuantity = truncateQuantity(
      Math.max(0, params.returnedByItemId.get(saleItem.id) ?? 0)
    );
    const availableToReturn = truncateQuantity(
      Math.max(0, soldQuantity - returnedQuantity)
    );

    if (requestedLine.quantity - availableToReturn > STOCK_EPSILON) {
      throw new Error(
        `La cantidad solicitada para el ítem ${saleItem.id} excede lo disponible para devolver (${availableToReturn.toFixed(2)}).`
      );
    }

    const unitPrice = truncateMoney(
      Math.max(0, Number(saleItem.unit_price ?? 0))
    );
    const grossAmount = truncateMoney(requestedLine.quantity * unitPrice);
    const soldSubtotalBeforeGlobalDiscount = truncateMoney(
      Math.max(0, Number(saleItem.subtotal ?? 0))
    );
    const itemGlobalDiscountShare = resolveItemGlobalDiscountShare({
      itemSubtotal: soldSubtotalBeforeGlobalDiscount,
      distribution: pricingDistribution,
    });
    const totalItemLineDiscount = truncateMoney(
      Math.max(0, Number(saleItem.discount_amount ?? 0))
    );
    const lineDiscountPerUnit =
      soldQuantity > STOCK_EPSILON ? totalItemLineDiscount / soldQuantity : 0;
    const lineDiscountAmount = truncateMoney(
      Math.min(grossAmount, lineDiscountPerUnit * requestedLine.quantity)
    );
    const subtotalBeforeGlobalDiscount = truncateMoney(
      Math.max(0, grossAmount - lineDiscountAmount)
    );
    const globalDiscountPerUnit =
      soldQuantity > STOCK_EPSILON ? itemGlobalDiscountShare / soldQuantity : 0;
    const globalDiscountAmount = truncateMoney(
      Math.min(
        subtotalBeforeGlobalDiscount,
        globalDiscountPerUnit * requestedLine.quantity
      )
    );
    const discountAmount = truncateMoney(
      lineDiscountAmount + globalDiscountAmount
    );
    const subtotalAmount = truncateMoney(
      Math.max(0, subtotalBeforeGlobalDiscount - globalDiscountAmount)
    );

    return {
      posSaleItemId: saleItem.id,
      productId: saleItem.product_id,
      lotId: saleItem.lot_id ?? null,
      quantity: requestedLine.quantity,
      unitPrice,
      subtotalAmount,
      discountAmount,
      reason: requestedLine.reason,
      unitQuantity: requestedLine.unitQuantity,
    };
  });
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Restock reversal needs several guarded branches across lots and movement snapshots.
async function buildInboundStockReversalContext(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  createdBy: string;
  lines: ResolvedReturnLine[];
  saleReference: string;
  movementReason: string;
}): Promise<StockReversalContext> {
  const { supabase, orgId, createdBy, lines, saleReference, movementReason } =
    params;

  if (!lines.length) {
    return {
      lotUpdates: [],
      rollbackLotUpdates: [],
      movementPayloads: [],
    };
  }

  const lotIds = lines
    .map((line) => line.lotId)
    .filter((lotId): lotId is string => Boolean(lotId));

  if (lotIds.length !== lines.length) {
    throw new Error(
      "No se puede reingresar stock porque uno de los ítems no tiene lote asociado."
    );
  }

  const [lotsResult, outboundMovementsResult] = await Promise.all([
    supabase
      .from("product_lots")
      .select(
        "id, product_id, lot_number, expiration_date, quantity_available, unit_quantity_available"
      )
      .eq("organization_id", orgId)
      .in("id", lotIds),
    supabase
      .from("stock_movements")
      .select("lot_id, quantity, unit_quantity")
      .eq("organization_id", orgId)
      .or("type.eq.OUTBOUND,type.eq.POS_SALE")
      .eq("reason", `Venta POS ${saleReference}`)
      .in("lot_id", lotIds),
  ]);

  if (lotsResult.error) {
    throw new Error(
      `No se pudieron obtener lotes para reingresar stock: ${lotsResult.error.message}`
    );
  }

  if (outboundMovementsResult.error) {
    throw new Error(
      `No se pudieron obtener movimientos originales de stock de la venta POS: ${outboundMovementsResult.error.message}`
    );
  }

  const lotsById = new Map<string, MutableLotState>();

  for (const lot of lotsResult.data ?? []) {
    if (!(lot.id && lot.product_id && lot.lot_number && lot.expiration_date)) {
      continue;
    }

    lotsById.set(lot.id, {
      id: lot.id,
      productId: lot.product_id,
      lotNumber: lot.lot_number,
      expirationDate: lot.expiration_date,
      quantityAvailable: truncateQuantity(
        Math.max(0, lot.quantity_available ?? 0)
      ),
      unitQuantityAvailable:
        lot.unit_quantity_available !== null &&
        lot.unit_quantity_available !== undefined
          ? truncateQuantity(Math.max(0, lot.unit_quantity_available))
          : null,
    });
  }

  const outboundTotalsByLot = new Map<
    string,
    { totalBaseQuantity: number; totalUnitQuantity: number }
  >();

  for (const movement of outboundMovementsResult.data ?? []) {
    if (!movement.lot_id) {
      continue;
    }

    const current = outboundTotalsByLot.get(movement.lot_id) ?? {
      totalBaseQuantity: 0,
      totalUnitQuantity: 0,
    };

    const quantity = truncateQuantity(Math.abs(Number(movement.quantity ?? 0)));
    const unitQuantity =
      movement.unit_quantity !== null && movement.unit_quantity !== undefined
        ? truncateQuantity(Math.abs(Number(movement.unit_quantity)))
        : 0;

    outboundTotalsByLot.set(movement.lot_id, {
      totalBaseQuantity: truncateQuantity(current.totalBaseQuantity + quantity),
      totalUnitQuantity: truncateQuantity(
        current.totalUnitQuantity + unitQuantity
      ),
    });
  }

  const timestamp = new Date().toISOString();
  const lotUpdatesById = new Map<
    string,
    Database["public"]["Tables"]["product_lots"]["Insert"]
  >();
  const rollbackByLotId = new Map<
    string,
    Database["public"]["Tables"]["product_lots"]["Insert"]
  >();
  const movementPayloads: Database["public"]["Tables"]["stock_movements"]["Insert"][] =
    [];

  for (const line of lines) {
    if (!line.lotId) {
      throw new Error(
        "No se puede reingresar stock porque un ítem no tiene lote asociado."
      );
    }

    const lot = lotsById.get(line.lotId);

    if (!lot) {
      throw new Error(
        `No se encontró el lote ${line.lotId} para reingresar el producto devuelto.`
      );
    }

    const inboundUnitQuantity = line.unitQuantity ?? null;
    const inboundBaseQuantity = line.quantity;

    if (inboundBaseQuantity <= STOCK_EPSILON) {
      throw new Error(
        `No se pudo calcular la cantidad de reingreso para el ítem ${line.posSaleItemId}.`
      );
    }

    if (!rollbackByLotId.has(lot.id)) {
      rollbackByLotId.set(lot.id, {
        id: lot.id,
        organization_id: orgId,
        product_id: lot.productId,
        lot_number: lot.lotNumber,
        expiration_date: lot.expirationDate,
        quantity_available: lot.quantityAvailable,
        ...(lot.unitQuantityAvailable !== null
          ? { unit_quantity_available: lot.unitQuantityAvailable }
          : {}),
        updated_at: timestamp,
      });
    }

    const previousStock = lot.quantityAvailable;
    const newStock = truncateQuantity(previousStock + inboundBaseQuantity);

    const previousUnitStock = lot.unitQuantityAvailable;
    const movementUnitQuantity =
      inboundUnitQuantity !== null && previousUnitStock !== null
        ? truncateQuantity(inboundUnitQuantity)
        : null;
    const newUnitStock =
      movementUnitQuantity !== null && previousUnitStock !== null
        ? truncateQuantity(previousUnitStock + movementUnitQuantity)
        : previousUnitStock;

    lot.quantityAvailable = newStock;
    lot.unitQuantityAvailable = newUnitStock;

    lotUpdatesById.set(lot.id, {
      id: lot.id,
      organization_id: orgId,
      product_id: lot.productId,
      lot_number: lot.lotNumber,
      expiration_date: lot.expirationDate,
      quantity_available: newStock,
      ...(newUnitStock !== null
        ? { unit_quantity_available: newUnitStock }
        : {}),
      updated_at: timestamp,
    });

    movementPayloads.push({
      organization_id: orgId,
      lot_id: lot.id,
      created_by: createdBy,
      type: "INBOUND",
      quantity: inboundBaseQuantity,
      previous_stock: previousStock,
      new_stock: newStock,
      unit_quantity: movementUnitQuantity,
      reason: movementReason,
    });
  }

  return {
    lotUpdates: Array.from(lotUpdatesById.values()),
    rollbackLotUpdates: Array.from(rollbackByLotId.values()),
    movementPayloads,
  };
}

async function applyInboundStockAdjustments(
  supabase: SupabaseServerClient,
  context: StockReversalContext
): Promise<string[]> {
  if (!context.lotUpdates.length) {
    return [];
  }

  const { error: lotUpdateError } = await supabase
    .from("product_lots")
    .upsert(context.lotUpdates);

  if (lotUpdateError) {
    throw new Error(
      `No se pudo reingresar stock en lotes: ${lotUpdateError.message}`
    );
  }

  if (!context.movementPayloads.length) {
    return [];
  }

  const { data: insertedMovements, error: movementError } = await supabase
    .from("stock_movements")
    .insert(context.movementPayloads)
    .select("id");

  if (movementError) {
    await supabase.from("product_lots").upsert(context.rollbackLotUpdates);

    throw new Error(
      `No se pudo registrar movimientos de reingreso de stock: ${movementError.message}`
    );
  }

  return (insertedMovements ?? [])
    .map((movement) => movement.id)
    .filter((id): id is string => Boolean(id));
}

async function rollbackInboundStockAdjustments(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  context: StockReversalContext;
  movementIds: string[];
}) {
  const { supabase, orgId, context, movementIds } = params;

  if (movementIds.length) {
    try {
      await supabase
        .from("stock_movements")
        .delete()
        .in("id", movementIds)
        .eq("organization_id", orgId);
    } catch (error) {
      console.error(
        "No se pudieron revertir movimientos de stock de devolución POS",
        error
      );
    }
  }

  if (context.rollbackLotUpdates.length) {
    try {
      await supabase.from("product_lots").upsert(context.rollbackLotUpdates);
    } catch (error) {
      console.error(
        "No se pudo revertir actualización de lotes de devolución POS",
        error
      );
    }
  }
}

async function createCustomerCreditRecord(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  customerId: string;
  amount: number;
  notes: string;
}): Promise<string | null> {
  const creditAmount = truncateMoney(Math.max(0, params.amount));

  if (creditAmount <= 0) {
    return null;
  }

  const { data, error } = await params.supabase
    .from("customer_credits")
    .insert({
      organization_id: params.orgId,
      customer_id: params.customerId,
      amount: creditAmount,
      remaining_amount: creditAmount,
      currency: "ARS",
      source_payment_id: null,
      notes: params.notes,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(
      `No se pudo registrar saldo a favor del cliente: ${error.message}`
    );
  }

  return data?.id ?? null;
}

async function rollbackCustomerCredit(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  customerCreditId: string;
}) {
  try {
    await params.supabase
      .from("customer_credits")
      .delete()
      .eq("organization_id", params.orgId)
      .eq("id", params.customerCreditId);
  } catch (error) {
    console.error("No se pudo revertir crédito de cliente de devolución POS", {
      customerCreditId: params.customerCreditId,
      error,
    });
  }
}

async function applyRefundAgainstReceivable(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  receivableId: string;
  refundAmount: number;
  customerId: string | null;
  notesPrefix: string;
}): Promise<string | null> {
  const {
    supabase,
    orgId,
    receivableId,
    refundAmount,
    customerId,
    notesPrefix,
  } = params;

  const { data: receivable, error: receivableError } = await supabase
    .from("accounts_receivable")
    .select("id, total_amount, pending_balance, customer_id, due_date, status")
    .eq("organization_id", orgId)
    .eq("id", receivableId)
    .maybeSingle();

  if (receivableError) {
    throw new Error(
      `No se pudo obtener la cuenta corriente a ajustar: ${receivableError.message}`
    );
  }

  if (!receivable?.id) {
    throw new Error(
      "No se encontró la cuenta corriente asociada a la venta POS."
    );
  }

  const previousTotal = truncateMoney(Number(receivable.total_amount ?? 0));
  const previousPending = truncateMoney(
    Number(receivable.pending_balance ?? 0)
  );
  const paidAmount = truncateMoney(
    Math.max(0, previousTotal - previousPending)
  );
  const safeRefundAmount = truncateMoney(Math.max(0, refundAmount));
  const nextTotal = truncateMoney(
    Math.max(0, previousTotal - safeRefundAmount)
  );
  const nextPending = truncateMoney(Math.max(0, nextTotal - paidAmount));
  const nextStatus = resolveReceivableStatus(nextTotal, nextPending);
  const overpaidAmount = truncateMoney(Math.max(0, paidAmount - nextTotal));

  const { error: updateError } = await supabase
    .from("accounts_receivable")
    .update({
      total_amount: nextTotal,
      pending_balance: nextPending,
      status: nextStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", orgId)
    .eq("id", receivable.id);

  if (updateError) {
    throw new Error(
      `No se pudo ajustar la cuenta corriente por devolución POS: ${updateError.message}`
    );
  }

  if (overpaidAmount <= 0) {
    return null;
  }

  const resolvedCustomerId = customerId ?? receivable.customer_id ?? null;

  if (!resolvedCustomerId) {
    await supabase
      .from("accounts_receivable")
      .update({
        total_amount: previousTotal,
        pending_balance: previousPending,
        status:
          (receivable.status as Database["public"]["Enums"]["receivable_status"]) ??
          "PENDING",
      })
      .eq("organization_id", orgId)
      .eq("id", receivable.id);

    throw new Error(
      "La devolución generó saldo a favor pero la venta POS no tiene cliente asociado."
    );
  }

  try {
    return await createCustomerCreditRecord({
      supabase,
      orgId,
      customerId: resolvedCustomerId,
      amount: overpaidAmount,
      notes: `${notesPrefix}. Saldo a favor por sobrepago en cuenta corriente.`,
    });
  } catch (error) {
    await supabase
      .from("accounts_receivable")
      .update({
        total_amount: previousTotal,
        pending_balance: previousPending,
        status:
          (receivable.status as Database["public"]["Enums"]["receivable_status"]) ??
          "PENDING",
      })
      .eq("organization_id", orgId)
      .eq("id", receivable.id);

    throw error;
  }
}

async function decreaseSessionCashTotals(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  sessionId: string;
  amount: number;
}) {
  const { supabase, orgId, sessionId, amount } = params;
  const safeAmount = truncateMoney(Math.max(0, amount));

  if (safeAmount <= 0) {
    return;
  }

  const { data: session, error: sessionError } = await supabase
    .from("pos_sessions")
    .select("cash_sales_amount, expected_cash_end")
    .eq("organization_id", orgId)
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError) {
    throw new Error(
      `No se pudo obtener la sesión POS para ajustar caja: ${sessionError.message}`
    );
  }

  if (!session) {
    throw new Error("No se encontró la sesión POS asociada a la venta.");
  }

  const nextCashSalesAmount = truncateMoney(
    Math.max(0, Number(session.cash_sales_amount ?? 0) - safeAmount)
  );
  const nextExpectedCashEnd = truncateMoney(
    Math.max(0, Number(session.expected_cash_end ?? 0) - safeAmount)
  );

  const { error: updateError } = await supabase
    .from("pos_sessions")
    .update({
      cash_sales_amount: nextCashSalesAmount,
      expected_cash_end: nextExpectedCashEnd,
    })
    .eq("organization_id", orgId)
    .eq("id", sessionId);

  if (updateError) {
    throw new Error(
      `No se pudo ajustar caja por devolución en efectivo: ${updateError.message}`
    );
  }
}

async function cleanupFailedPosSaleReturn(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  posSaleReturnId: string;
}) {
  const { supabase, orgId, posSaleReturnId } = params;

  try {
    await supabase
      .from(POS_SALES_RETURN_ITEMS_TABLE)
      .delete()
      .eq("pos_sale_return_id" as never, posSaleReturnId);
  } catch (error) {
    console.error("No se pudieron limpiar ítems de devolución POS fallida", {
      posSaleReturnId,
      error,
    });
  }

  try {
    await supabase
      .from(POS_SALES_RETURNS_TABLE)
      .delete()
      .eq("id", posSaleReturnId)
      .eq("organization_id", orgId);
  } catch (error) {
    console.error("No se pudo limpiar cabecera de devolución POS fallida", {
      posSaleReturnId,
      error,
    });
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: POS return processing orchestrates validation, stock, and financial compensations.
export async function processPosSaleReturn(
  input: ProcessPosSaleReturnInput
): Promise<ProcessPosSaleReturnResult> {
  const parsed = processPosSaleReturnSchema.safeParse(input);

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      issue?.message ?? "Datos inválidos para procesar la devolución POS."
    );
  }

  const payload = parsed.data;
  const org = await getOrganizationBySlug(payload.orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada.");
  }

  const supabase = await createClient();
  const currentUserId = await getCurrentUserId(supabase);

  const { data: saleData, error: saleError } = await supabase
    .from("pos_sales")
    .select(`
      id,
      organization_id,
      session_id,
      customer_id,
      receipt_number,
      sale_date,
      status,
      discount_amount,
      total_amount,
      items:pos_sale_items(
        id,
        pos_sale_id,
        product_id,
        lot_id,
        quantity,
        unit_price,
        subtotal,
        discount_amount
      ),
      payments:pos_payments(
        id,
        amount,
        payment_method,
        generated_receivable_id
      )
    `)
    .eq("organization_id", org.id)
    .eq("id", payload.posSaleId)
    .maybeSingle();

  if (saleError) {
    throw new Error(
      `No se pudo obtener la venta POS a devolver: ${saleError.message}`
    );
  }

  if (!saleData?.id) {
    throw new Error("Venta POS no encontrada.");
  }

  const posSale = saleData as PosSaleRaw;
  const normalizedStatus = normalizeForComparison(posSale.status);

  if (
    normalizedStatus.includes("cancel") ||
    normalizedStatus.includes("anul")
  ) {
    throw new Error(
      "No se pueden registrar devoluciones sobre ventas anuladas."
    );
  }

  const requestedItems = normalizeRequestedItems(payload.items);
  const returnedByItemId = await getReturnedQuantityBySaleItemId({
    supabase,
    posSaleId: posSale.id,
  });

  const resolvedLines = resolveReturnLines({
    requestedItems,
    saleItems: posSale.items ?? [],
    returnedByItemId,
    saleDiscountAmount: truncateMoney(
      Math.max(0, Number(posSale.discount_amount ?? 0))
    ),
  });

  if (!resolvedLines.length) {
    throw new Error("No hay ítems válidos para devolver.");
  }

  const totalReturnedAmount = truncateMoney(
    resolvedLines.reduce((sum, line) => sum + line.subtotalAmount, 0)
  );

  if (totalReturnedAmount <= 0) {
    throw new Error("El total de la devolución debe ser mayor a cero.");
  }

  const linkedReceivableId = resolveLinkedReceivableId(
    posSale.payments ?? null
  );
  const effectiveRefundMethod =
    payload.resolution === "refund"
      ? resolveEffectiveRefundMethod({
          requestedMethod: payload.refundMethod ?? null,
          payments: posSale.payments ?? null,
          linkedReceivableId,
        })
      : null;

  const refundedAmount =
    payload.resolution === "refund"
      ? truncateMoney(payload.refundAmount ?? totalReturnedAmount)
      : 0;

  if (payload.resolution === "refund") {
    if (refundedAmount <= 0) {
      throw new Error("El monto a reintegrar debe ser mayor a cero.");
    }

    if (refundedAmount - totalReturnedAmount > STOCK_EPSILON) {
      throw new Error(
        "El monto a reintegrar no puede ser mayor al total de la devolución."
      );
    }

    if (
      effectiveRefundMethod === "accounts_receivable" &&
      !linkedReceivableId
    ) {
      throw new Error(
        "La devolución se configuró contra cuenta corriente pero la venta POS no tiene una cuenta asociada."
      );
    }
  }

  if (payload.resolution === "credit_note" && !posSale.customer_id) {
    throw new Error(
      "No se puede generar nota de crédito para una venta POS sin cliente asociado."
    );
  }

  const creditNoteAmount =
    payload.resolution === "credit_note" ? totalReturnedAmount : 0;
  const saleReference = resolvePosSaleReference(posSale);
  const returnDateTime = toReturnDateTime(payload.returnDate);
  const normalizedReason = sanitizeText(payload.reason);
  const financialNotePrefix = `Devolución POS ${saleReference}`;

  let posSaleReturnId: string | null = null;
  let customerCreditId: string | null = null;
  let stockContext: StockReversalContext | null = null;
  let stockMovementIds: string[] = [];

  try {
    const { data: insertedReturnData, error: insertReturnError } =
      await supabase
        .from(POS_SALES_RETURNS_TABLE)
        .insert({
          organization_id: org.id,
          pos_sale_id: posSale.id,
          return_date: returnDateTime,
          reason: normalizedReason,
          resolution: payload.resolution,
          restock: payload.restock,
          total_amount: totalReturnedAmount,
          refund_amount: refundedAmount > 0 ? refundedAmount : null,
          refund_method: effectiveRefundMethod,
          credit_note_amount: creditNoteAmount > 0 ? creditNoteAmount : null,
          created_by: currentUserId,
        } as never)
        .select("id")
        .maybeSingle();

    if (insertReturnError) {
      throw new Error(
        resolveSchemaAwareErrorMessage(
          insertReturnError,
          "No se pudo registrar la cabecera de devolución POS."
        )
      );
    }

    posSaleReturnId =
      (insertedReturnData as unknown as { id?: string | null })?.id ?? null;

    if (!posSaleReturnId) {
      throw new Error("No se pudo obtener el ID de la devolución POS.");
    }

    const returnItemsPayload = resolvedLines.map((line) => ({
      organization_id: org.id,
      pos_sale_return_id: posSaleReturnId,
      pos_sale_id: posSale.id,
      pos_sale_item_id: line.posSaleItemId,
      product_id: line.productId,
      lot_id: line.lotId,
      quantity: line.quantity,
      unit_price: line.unitPrice,
      subtotal: line.subtotalAmount,
      discount_amount: line.discountAmount,
      tax_rate: 0,
      reason: line.reason,
    }));

    const { error: insertReturnItemsError } = await supabase
      .from(POS_SALES_RETURN_ITEMS_TABLE)
      .insert(returnItemsPayload as never);

    if (insertReturnItemsError) {
      throw new Error(
        resolveSchemaAwareErrorMessage(
          insertReturnItemsError,
          "No se pudieron registrar los ítems de la devolución POS."
        )
      );
    }

    if (payload.restock) {
      stockContext = await buildInboundStockReversalContext({
        supabase,
        orgId: org.id,
        createdBy: currentUserId,
        lines: resolvedLines,
        saleReference,
        movementReason: `Devolución POS ${saleReference} (${posSaleReturnId})`,
      });

      stockMovementIds = await applyInboundStockAdjustments(
        supabase,
        stockContext
      );
    }

    if (payload.resolution === "credit_note") {
      customerCreditId = await createCustomerCreditRecord({
        supabase,
        orgId: org.id,
        customerId: posSale.customer_id as string,
        amount: creditNoteAmount,
        notes: `${financialNotePrefix}. Nota de crédito por devolución POS ${posSaleReturnId}.`,
      });
    } else if (effectiveRefundMethod === "cash") {
      await decreaseSessionCashTotals({
        supabase,
        orgId: org.id,
        sessionId: posSale.session_id,
        amount: refundedAmount,
      });
    } else if (effectiveRefundMethod === "accounts_receivable") {
      if (!linkedReceivableId) {
        throw new Error(
          "No se encontró cuenta corriente asociada para aplicar la devolución."
        );
      }

      customerCreditId = await applyRefundAgainstReceivable({
        supabase,
        orgId: org.id,
        receivableId: linkedReceivableId,
        refundAmount: refundedAmount,
        customerId: posSale.customer_id,
        notesPrefix: `${financialNotePrefix}. Ajuste de cuenta corriente.`,
      });
    }

    return {
      posSaleReturnId,
      totalReturnedAmount,
      refundedAmount,
      creditNoteAmount,
      effectiveRefundMethod,
      customerCreditId,
      stockMovementIds,
    };
  } catch (error) {
    if (stockContext) {
      await rollbackInboundStockAdjustments({
        supabase,
        orgId: org.id,
        context: stockContext,
        movementIds: stockMovementIds,
      });
    }

    if (customerCreditId) {
      await rollbackCustomerCredit({
        supabase,
        orgId: org.id,
        customerCreditId,
      });
    }

    if (posSaleReturnId) {
      await cleanupFailedPosSaleReturn({
        supabase,
        orgId: org.id,
        posSaleReturnId,
      });
    }

    throw error;
  }
}

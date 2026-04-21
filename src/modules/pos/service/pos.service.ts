import { truncateMoney } from "@/lib/decimal";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { Database } from "@/types/supabase";
import {
  type CreatePosSaleInput,
  type CreatePosSaleResult,
  createPosSaleSchema,
  type PosSale,
  type PosSaleDetail,
  type PosSaleItemInput,
  type PosSaleReturnRecord,
  type PosSaleReturnSummary,
  type PosTerminalProduct,
  posProductSearchParamsSchema,
} from "../types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type PosPaymentMethodInsertValue =
  Database["public"]["Tables"]["pos_payments"]["Insert"]["payment_method"];

type PosPaymentMethodValue = string;

type PosSaleRaw = Database["public"]["Tables"]["pos_sales"]["Row"] & {
  customer?: {
    id?: string | null;
    business_name?: string | null;
    fantasy_name?: string | null;
  } | null;
  session?: {
    terminal?: {
      id?: string | null;
      name?: string | null;
      code?: string | null;
      cash_register_number?: number | null;
    } | null;
  } | null;
  items?:
    | (Database["public"]["Tables"]["pos_sale_items"]["Row"] & {
        product?: {
          id?: string | null;
          name?: string | null;
          sku?: string | null;
          unit_of_measure?:
            | Database["public"]["Enums"]["unit_of_measure_type"]
            | null;
        } | null;
      })[]
    | null;
  payments?: Database["public"]["Tables"]["pos_payments"]["Row"][] | null;
};

type OrganizationMemberWithUser =
  Database["public"]["Functions"]["get_organization_members_with_users"]["Returns"][number];

type PosSaleUsersById = Map<string, NonNullable<PosSale["user"]>>;

type PosSaleReturnRaw = {
  id?: string | null;
  pos_sale_id?: string | null;
  return_date?: string | null;
  reason?: string | null;
  resolution?: string | null;
  restock?: boolean | null;
  total_amount?: number | null;
  refund_amount?: number | null;
  refund_method?: string | null;
  credit_note_amount?: number | null;
  created_at?: string | null;
};

type PosSaleReturnTotals = {
  returnsCount: number;
  totalReturnedAmount: number;
  totalRefundedAmount: number;
  totalCreditedAmount: number;
};

type PostgrestLikeError = {
  code?: string | null;
  message?: string | null;
};

type NormalizedPosSaleItem = {
  lineId: string;
  productId: string;
  quantity: number;
  weightQuantity: number | null;
  effectiveQuantity: number;
  unitPrice: number;
  discountAmount: number;
  subtotal: number;
  lotId: string | null;
};

type ProductStockMetadata = {
  id: string;
  name: string;
  unitOfMeasure: Database["public"]["Enums"]["unit_of_measure_type"];
  tracksStockUnits: boolean;
  weightPerUnit: number | null;
};

type LotAllocation = {
  lotId: string;
  consumedBase: number;
  consumedUnits: number | null;
};

type StockAdjustmentContext = {
  lotUpdates: Database["public"]["Tables"]["product_lots"]["Insert"][];
  rollbackLotUpdates: Database["public"]["Tables"]["product_lots"]["Insert"][];
  movementPayloads: Database["public"]["Tables"]["stock_movements"]["Insert"][];
  allocationsByLine: Map<string, LotAllocation[]>;
};

type MutableLotState = {
  id: string;
  productId: string;
  lotNumber: string;
  expirationDate: string;
  createdAt: string | null;
  quantityAvailable: number;
  unitQuantityAvailable: number | null;
};

const MAX_RECEIPT_SUFFIX = 1_000_000;
const STOCK_EPSILON = 0.000_001;
const POS_SALES_RETURNS_TABLE = "pos_sales_returns" as "pos_sales";

const paymentMethodCandidates: Record<
  NonNullable<CreatePosSaleInput["paymentMethod"]>,
  PosPaymentMethodValue[]
> = {
  efectivo: ["CASH", "efectivo", "EFECTIVO"],
  tarjeta_de_credito: [
    "CREDIT_CARD",
    "CARD_CREDIT",
    "CARD",
    "tarjeta de credito",
    "TARJETA_CREDITO",
  ],
  tarjeta_de_debito: [
    "DEBIT_CARD",
    "CARD_DEBIT",
    "CARD",
    "tarjeta de debito",
    "TARJETA_DEBITO",
  ],
  transferencia: [
    "BANK_TRANSFER",
    "TRANSFER",
    "transferencia",
    "TRANSFERENCIA",
  ],
  cheque: ["CHECK", "CHEQUE", "cheque"],
  deposito: [
    "BANK_TRANSFER",
    "TRANSFER",
    "transferencia",
    "TRANSFERENCIA",
    "OTHER",
    "OTRO",
  ],
  "e-cheq": ["E_CHECK", "ECHECK", "CHECK", "CHEQUE", "cheque"],
};

function clampPercentage(value: number): number {
  return Math.min(Math.max(value, 0), 100);
}

function getFallbackUserLabel(userId: string): string {
  return `Usuario ${userId.slice(0, 8)}`;
}

function sanitizeText(value?: string | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toSaleDateTime(value: string): string {
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

function buildReceiptNumber(): string {
  const datePart = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const randomPart = Math.floor(Math.random() * MAX_RECEIPT_SUFFIX)
    .toString()
    .padStart(6, "0");

  return `POS-${datePart}-${randomPart}`;
}

function isWeightOrVolumeUnit(
  unit: Database["public"]["Enums"]["unit_of_measure_type"]
): boolean {
  return unit === "KG" || unit === "LT" || unit === "MT";
}

function truncateQuantity(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function isPosReturnsSchemaError(error: PostgrestLikeError): boolean {
  const normalizedMessage = String(error.message ?? "").toLowerCase();

  if (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205"
  ) {
    return true;
  }

  return (
    normalizedMessage.includes("pos_sales_returns") &&
    (normalizedMessage.includes("does not exist") ||
      normalizedMessage.includes("could not find the table") ||
      normalizedMessage.includes("column") ||
      normalizedMessage.includes("relation"))
  );
}

function createEmptyReturnTotals(): PosSaleReturnTotals {
  return {
    returnsCount: 0,
    totalReturnedAmount: 0,
    totalRefundedAmount: 0,
    totalCreditedAmount: 0,
  };
}

function resolveReturnSummary(
  saleTotalAmount: number,
  totals?: PosSaleReturnTotals
): PosSaleReturnSummary {
  const normalizedSaleTotal = truncateMoney(Math.max(0, saleTotalAmount));
  const normalizedTotals = totals ?? createEmptyReturnTotals();

  const totalReturnedAmount = truncateMoney(
    Math.max(0, normalizedTotals.totalReturnedAmount)
  );
  const totalRefundedAmount = truncateMoney(
    Math.max(0, normalizedTotals.totalRefundedAmount)
  );
  const totalCreditedAmount = truncateMoney(
    Math.max(0, normalizedTotals.totalCreditedAmount)
  );
  const pendingReturnableAmount = truncateMoney(
    Math.max(0, normalizedSaleTotal - totalReturnedAmount)
  );

  return {
    returnsCount: Math.max(0, normalizedTotals.returnsCount),
    totalReturnedAmount,
    totalRefundedAmount,
    totalCreditedAmount,
    pendingReturnableAmount,
  };
}

function resolveSaleUser(
  sale: PosSaleRaw,
  saleUsersById?: PosSaleUsersById
): PosSale["user"] {
  const userId = sale.user_id ?? null;

  if (!userId) {
    return null;
  }

  if (!saleUsersById) {
    return {
      id: userId,
      name: getFallbackUserLabel(userId),
      email: null,
    };
  }

  const existingUser = saleUsersById.get(userId);

  if (existingUser) {
    return existingUser;
  }

  return {
    id: userId,
    name: getFallbackUserLabel(userId),
    email: null,
  };
}

function resolveSaleCustomer(sale: PosSaleRaw): PosSale["customer"] {
  if (!sale.customer?.id) {
    return null;
  }

  return {
    id: sale.customer.id,
    business_name: sale.customer.business_name ?? "Consumidor final",
    fantasy_name: sale.customer.fantasy_name ?? null,
  };
}

function resolveSaleTerminal(sale: PosSaleRaw): PosSale["terminal"] {
  const terminal = sale.session?.terminal;

  if (!terminal?.id) {
    return null;
  }

  return {
    id: terminal.id,
    name: terminal.name ?? "Caja sin nombre",
    code: terminal.code ?? null,
    cash_register_number: terminal.cash_register_number ?? null,
  };
}

function resolveSaleItems(sale: PosSaleRaw): PosSale["items"] {
  return (sale.items ?? []).map((item) => ({
    ...item,
    product: item.product?.id
      ? {
          id: item.product.id,
          name: item.product.name ?? "Producto sin nombre",
          sku: item.product.sku ?? "",
          unitOfMeasure: item.product.unit_of_measure ?? null,
        }
      : null,
  }));
}

function normalizePosSale(
  sale: PosSaleRaw,
  returnTotals?: PosSaleReturnTotals,
  saleUsersById?: PosSaleUsersById
): PosSale {
  return {
    ...sale,
    customer: resolveSaleCustomer(sale),
    terminal: resolveSaleTerminal(sale),
    items: resolveSaleItems(sale),
    payments: sale.payments ?? [],
    user: resolveSaleUser(sale, saleUsersById),
    returnSummary: resolveReturnSummary(
      Number(sale.total_amount ?? 0),
      returnTotals
    ),
  };
}

async function getSaleUsersById(params: {
  supabase: SupabaseServerClient;
  orgSlug: string;
}): Promise<PosSaleUsersById> {
  const { supabase, orgSlug } = params;
  const usersById: PosSaleUsersById = new Map();

  const [membersResult, currentUserResult] = await Promise.all([
    supabase.rpc("get_organization_members_with_users", {
      org_slug_param: orgSlug,
    }),
    supabase.auth.getUser(),
  ]);

  if (membersResult.error) {
    console.warn(
      `No se pudieron obtener miembros para ventas POS: ${membersResult.error.message}`
    );
  }

  for (const member of (membersResult.data ??
    []) as OrganizationMemberWithUser[]) {
    if (!member.user_id) {
      continue;
    }

    const displayName =
      member.full_name ?? member.email ?? getFallbackUserLabel(member.user_id);

    usersById.set(member.user_id, {
      id: member.user_id,
      name: displayName,
      email: member.email ?? null,
    });
  }

  if (currentUserResult.error) {
    console.warn(
      `No se pudo obtener usuario autenticado para ventas POS: ${currentUserResult.error.message}`
    );

    return usersById;
  }

  const currentUser = currentUserResult.data.user;

  if (currentUser?.id && !usersById.has(currentUser.id)) {
    const metadata = currentUser.user_metadata as
      | { full_name?: string }
      | undefined;

    usersById.set(currentUser.id, {
      id: currentUser.id,
      name:
        metadata?.full_name ??
        currentUser.email ??
        getFallbackUserLabel(currentUser.id),
      email: currentUser.email ?? null,
    });
  }

  return usersById;
}

async function getPosSaleReturnTotalsBySaleIds(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  saleIds: string[];
}): Promise<Map<string, PosSaleReturnTotals>> {
  if (!params.saleIds.length) {
    return new Map();
  }

  const { data, error } = await params.supabase
    .from(POS_SALES_RETURNS_TABLE)
    .select("pos_sale_id, total_amount, refund_amount, credit_note_amount")
    .eq("organization_id", params.orgId)
    .in("pos_sale_id" as never, params.saleIds);

  if (error) {
    if (isPosReturnsSchemaError(error)) {
      return new Map();
    }

    throw new Error(
      `No se pudieron obtener devoluciones POS de las ventas: ${error.message}`
    );
  }

  const totalsBySaleId = new Map<string, PosSaleReturnTotals>();
  const rows = (data ?? []) as PosSaleReturnRaw[];

  for (const row of rows) {
    const posSaleId = row.pos_sale_id ?? null;

    if (!posSaleId) {
      continue;
    }

    const current = totalsBySaleId.get(posSaleId) ?? createEmptyReturnTotals();
    const totalAmount = truncateMoney(
      Math.max(0, Number(row.total_amount ?? 0))
    );
    const refundAmount = truncateMoney(
      Math.max(0, Number(row.refund_amount ?? 0))
    );
    const creditNoteAmount = truncateMoney(
      Math.max(0, Number(row.credit_note_amount ?? 0))
    );

    totalsBySaleId.set(posSaleId, {
      returnsCount: current.returnsCount + 1,
      totalReturnedAmount: truncateMoney(
        current.totalReturnedAmount + totalAmount
      ),
      totalRefundedAmount: truncateMoney(
        current.totalRefundedAmount + refundAmount
      ),
      totalCreditedAmount: truncateMoney(
        current.totalCreditedAmount + creditNoteAmount
      ),
    });
  }

  return totalsBySaleId;
}

async function getPosSaleReturnRecords(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  posSaleId: string;
}): Promise<PosSaleReturnRecord[]> {
  const { data, error } = await params.supabase
    .from(POS_SALES_RETURNS_TABLE)
    .select(
      "id, pos_sale_id, return_date, reason, resolution, restock, total_amount, refund_amount, refund_method, credit_note_amount, created_at"
    )
    .eq("organization_id", params.orgId)
    .eq("pos_sale_id", params.posSaleId)
    .order("return_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    if (isPosReturnsSchemaError(error)) {
      return [];
    }

    throw new Error(
      `No se pudieron obtener devoluciones de la venta POS: ${error.message}`
    );
  }

  return ((data ?? []) as PosSaleReturnRaw[])
    .filter(
      (row): row is PosSaleReturnRaw & { id: string; pos_sale_id: string } =>
        Boolean(row.id && row.pos_sale_id)
    )
    .map((row) => ({
      id: row.id,
      posSaleId: row.pos_sale_id,
      returnDate: row.return_date ?? null,
      reason: sanitizeText(row.reason),
      resolution: sanitizeText(row.resolution),
      restock: Boolean(row.restock),
      totalAmount: truncateMoney(Math.max(0, Number(row.total_amount ?? 0))),
      refundAmount: truncateMoney(Math.max(0, Number(row.refund_amount ?? 0))),
      refundMethod: sanitizeText(row.refund_method),
      creditNoteAmount: truncateMoney(
        Math.max(0, Number(row.credit_note_amount ?? 0))
      ),
      createdAt: row.created_at ?? null,
    }));
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: POS item normalization validates business rules and computes derived monetary fields.
function normalizePosItem(
  item: PosSaleItemInput,
  index: number
): NormalizedPosSaleItem {
  const productId = item.productId?.trim();

  if (!productId) {
    throw new Error(`El ítem #${index + 1} no tiene producto seleccionado.`);
  }

  const quantity = Number(item.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error(
      `El ítem #${index + 1} tiene una cantidad inválida (debe ser mayor a 0).`
    );
  }

  const rawWeightQuantity = Number(item.weightQuantity);
  const weightQuantity =
    Number.isFinite(rawWeightQuantity) && rawWeightQuantity > 0
      ? rawWeightQuantity
      : null;

  const effectiveQuantity = weightQuantity ?? quantity;

  if (!Number.isFinite(effectiveQuantity) || effectiveQuantity <= 0) {
    throw new Error(
      `El ítem #${index + 1} tiene una cantidad efectiva inválida.`
    );
  }

  const unitPrice = Number(item.unitPrice);
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    throw new Error(
      `El ítem #${index + 1} tiene un precio inválido (debe ser mayor o igual a 0).`
    );
  }

  const gross = truncateMoney(effectiveQuantity * unitPrice);

  const discountAmountRaw = Number(item.discountAmount);
  const discountPercentageRaw = Number(item.discountPercentage);

  let discountAmount = 0;

  if (Number.isFinite(discountAmountRaw) && discountAmountRaw > 0) {
    discountAmount = discountAmountRaw;
  } else if (
    Number.isFinite(discountPercentageRaw) &&
    discountPercentageRaw > 0
  ) {
    discountAmount = (clampPercentage(discountPercentageRaw) / 100) * gross;
  }

  const safeDiscount = truncateMoney(
    Math.min(Math.max(0, discountAmount), gross)
  );
  const subtotal = truncateMoney(Math.max(0, gross - safeDiscount));

  return {
    lineId: `${index}-${productId}`,
    productId,
    quantity: truncateQuantity(quantity),
    weightQuantity: weightQuantity ? truncateQuantity(weightQuantity) : null,
    effectiveQuantity: truncateQuantity(effectiveQuantity),
    unitPrice: truncateMoney(unitPrice),
    discountAmount: safeDiscount,
    subtotal,
    lotId: item.lotId ?? null,
  };
}

function normalizePosItems(items: PosSaleItemInput[]): NormalizedPosSaleItem[] {
  const normalized = items.map((item, index) => normalizePosItem(item, index));

  if (!normalized.length) {
    throw new Error(
      "Agrega al menos un producto para registrar la venta directa."
    );
  }

  return normalized;
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

async function getOpenSessionForTerminal(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  userId: string;
  terminalId: string;
}): Promise<string> {
  const { supabase, orgId, userId, terminalId } = params;

  const { data: terminal, error: terminalError } = await supabase
    .from("pos_terminals")
    .select("id, is_active")
    .eq("organization_id", orgId)
    .eq("id", terminalId)
    .maybeSingle();

  if (terminalError) {
    throw new Error(
      `No se pudo validar la terminal POS seleccionada: ${terminalError.message}`
    );
  }

  if (!terminal?.id) {
    throw new Error("La terminal POS seleccionada no existe.");
  }

  if (terminal.is_active === false) {
    throw new Error(
      "La terminal POS seleccionada está inactiva. Selecciona una terminal activa."
    );
  }

  const { data: openSession, error: openSessionError } = await supabase
    .from("pos_sessions")
    .select("id")
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .eq("terminal_id", terminalId)
    .eq(
      "status",
      "OPEN" satisfies Database["public"]["Enums"]["pos_session_status"]
    )
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (openSessionError) {
    throw new Error(
      `No se pudo validar la sesión POS abierta: ${openSessionError.message}`
    );
  }

  if (openSession?.id) {
    return openSession.id;
  }

  throw new Error(
    "No hay una caja abierta para esta terminal. Debes hacer una apertura de caja antes de registrar ventas."
  );
}

async function increaseSessionCashTotals(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  sessionId: string;
  amount: number;
}) {
  const { supabase, orgId, sessionId, amount } = params;

  if (!Number.isFinite(amount) || amount <= 0) {
    return;
  }

  const { data: session, error: sessionError } = await supabase
    .from("pos_sessions")
    .select("cash_sales_amount, expected_cash_end")
    .eq("organization_id", orgId)
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError || !session) {
    return;
  }

  await supabase
    .from("pos_sessions")
    .update({
      cash_sales_amount: truncateMoney(
        (session.cash_sales_amount ?? 0) + amount
      ),
      expected_cash_end: truncateMoney(
        (session.expected_cash_end ?? 0) + amount
      ),
    })
    .eq("organization_id", orgId)
    .eq("id", sessionId);
}

function resolvePaymentMethodCandidates(
  paymentMethod?: CreatePosSaleInput["paymentMethod"]
): PosPaymentMethodValue[] {
  const candidates = paymentMethod
    ? (paymentMethodCandidates[paymentMethod] ??
      paymentMethodCandidates.efectivo)
    : paymentMethodCandidates.efectivo;

  return [...new Set(candidates)];
}

function isEnumInputError(error: { code?: string | null; message?: string }) {
  if (error.code === "22P02") {
    return true;
  }

  const message = (error.message ?? "").toLowerCase();
  return message.includes("invalid input value for enum");
}

function isCashPayment(paymentMethod: PosPaymentMethodValue): boolean {
  if (!paymentMethod) {
    return false;
  }

  const normalized = paymentMethod.toLowerCase();
  return normalized === "cash" || normalized === "efectivo";
}

function compareLotsForFifo(a: MutableLotState, b: MutableLotState): number {
  const expirationA = a.expirationDate ? new Date(a.expirationDate) : null;
  const expirationB = b.expirationDate ? new Date(b.expirationDate) : null;

  const expirationDiff =
    (expirationA?.getTime() ?? Number.POSITIVE_INFINITY) -
    (expirationB?.getTime() ?? Number.POSITIVE_INFINITY);

  if (expirationDiff !== 0) {
    return expirationDiff;
  }

  const createdA = a.createdAt ? new Date(a.createdAt) : null;
  const createdB = b.createdAt ? new Date(b.createdAt) : null;

  const createdDiff =
    (createdA?.getTime() ?? Number.POSITIVE_INFINITY) -
    (createdB?.getTime() ?? Number.POSITIVE_INFINITY);

  if (createdDiff !== 0) {
    return createdDiff;
  }

  if (a.lotNumber !== b.lotNumber) {
    return a.lotNumber.localeCompare(b.lotNumber);
  }

  return a.id.localeCompare(b.id);
}

function getLotsTotals(lots: MutableLotState[]): {
  totalQuantity: number;
  totalUnits: number | null;
} {
  let totalQuantity = 0;
  let totalUnits = 0;
  let hasUnits = false;

  for (const lot of lots) {
    totalQuantity += Math.max(0, lot.quantityAvailable);

    if (lot.unitQuantityAvailable !== null) {
      hasUnits = true;
      totalUnits += Math.max(0, lot.unitQuantityAvailable);
    }
  }

  return {
    totalQuantity,
    totalUnits: hasUnits ? totalUnits : null,
  };
}

function computeAverageQuantityPerUnit(params: {
  product: ProductStockMetadata;
  totalQuantity: number;
  totalUnits: number | null;
}): number | null {
  const { product, totalQuantity, totalUnits } = params;

  if (
    !(product.tracksStockUnits && isWeightOrVolumeUnit(product.unitOfMeasure))
  ) {
    return null;
  }

  if (product.weightPerUnit && product.weightPerUnit > 0) {
    return product.weightPerUnit;
  }

  if (totalUnits !== null && totalUnits > 0 && totalQuantity > 0) {
    return totalQuantity / totalUnits;
  }

  return null;
}

function resolveWeightRequirement(params: {
  item: NormalizedPosSaleItem;
  product: ProductStockMetadata;
  totals: {
    totalQuantity: number;
    totalUnits: number | null;
  };
}): number {
  const { item, product, totals } = params;

  if (!isWeightOrVolumeUnit(product.unitOfMeasure)) {
    return item.effectiveQuantity;
  }

  if (item.weightQuantity && item.weightQuantity > 0) {
    return item.weightQuantity;
  }

  if (product.tracksStockUnits) {
    const averageQuantityPerUnit = computeAverageQuantityPerUnit({
      product,
      totalQuantity: totals.totalQuantity,
      totalUnits: totals.totalUnits,
    });

    if (averageQuantityPerUnit && item.quantity > 0) {
      return truncateQuantity(averageQuantityPerUnit * item.quantity);
    }
  }

  return item.quantity;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: FIFO stock allocation by lot requires multiple guarded branches and rollback snapshots.
async function buildStockAdjustmentContext(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  items: NormalizedPosSaleItem[];
  movementReason: string;
  createdBy: string;
}): Promise<StockAdjustmentContext> {
  const { supabase, orgId, items, movementReason, createdBy } = params;

  const productIds = Array.from(new Set(items.map((item) => item.productId)));

  if (!productIds.length) {
    return {
      lotUpdates: [],
      rollbackLotUpdates: [],
      movementPayloads: [],
      allocationsByLine: new Map(),
    };
  }

  const [productsResult, lotsResult] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, unit_of_measure, tracks_stock_units, weight_per_unit")
      .eq("organization_id", orgId)
      .in("id", productIds),
    supabase
      .from("product_lots")
      .select(
        "id, product_id, quantity_available, unit_quantity_available, lot_number, expiration_date, created_at"
      )
      .eq("organization_id", orgId)
      .in("product_id", productIds)
      .order("expiration_date", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (productsResult.error) {
    throw new Error(
      `No se pudieron validar los productos de la venta: ${productsResult.error.message}`
    );
  }

  if (lotsResult.error) {
    throw new Error(
      `No se pudieron obtener lotes para descontar stock: ${lotsResult.error.message}`
    );
  }

  const productsById = new Map<string, ProductStockMetadata>();

  for (const row of productsResult.data ?? []) {
    if (!row.id) {
      continue;
    }

    productsById.set(row.id, {
      id: row.id,
      name: row.name ?? "Producto sin nombre",
      unitOfMeasure:
        (row.unit_of_measure as Database["public"]["Enums"]["unit_of_measure_type"]) ||
        "UN",
      tracksStockUnits: Boolean(row.tracks_stock_units),
      weightPerUnit: row.weight_per_unit ?? null,
    });
  }

  for (const productId of productIds) {
    if (!productsById.has(productId)) {
      throw new Error(
        "Uno de los productos de la venta no existe o está inactivo."
      );
    }
  }

  const lotsByProduct = new Map<string, MutableLotState[]>();

  for (const row of lotsResult.data ?? []) {
    const lotId = row.id;
    const productId = row.product_id;
    const lotNumber = row.lot_number;
    const expirationDate = row.expiration_date;

    if (!(lotId && productId && lotNumber && expirationDate)) {
      continue;
    }

    const lotState: MutableLotState = {
      id: lotId,
      productId,
      lotNumber,
      expirationDate,
      createdAt: row.created_at ?? null,
      quantityAvailable: Math.max(0, row.quantity_available ?? 0),
      unitQuantityAvailable:
        row.unit_quantity_available !== null &&
        row.unit_quantity_available !== undefined
          ? Math.max(0, row.unit_quantity_available)
          : null,
    };

    const current = lotsByProduct.get(productId) ?? [];
    current.push(lotState);
    lotsByProduct.set(productId, current);
  }

  for (const [productId, productLots] of lotsByProduct.entries()) {
    productLots.sort(compareLotsForFifo);
    lotsByProduct.set(productId, productLots);
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
  const allocationsByLine = new Map<string, LotAllocation[]>();

  for (const item of items) {
    const product = productsById.get(item.productId);

    if (!product) {
      throw new Error("No se pudo validar un producto del carrito.");
    }

    const availableLots = [...(lotsByProduct.get(item.productId) ?? [])];

    const scopedLots = item.lotId
      ? availableLots.filter((lot) => lot.id === item.lotId)
      : availableLots;

    if (!scopedLots.length) {
      throw new Error(`No hay lotes disponibles para ${product.name}.`);
    }

    const totals = getLotsTotals(scopedLots);

    if (totals.totalQuantity <= 0) {
      throw new Error(`No hay stock disponible para ${product.name}.`);
    }

    const requiredBase = truncateQuantity(
      resolveWeightRequirement({
        item,
        product,
        totals,
      })
    );

    const requiredUnits =
      isWeightOrVolumeUnit(product.unitOfMeasure) && product.tracksStockUnits
        ? truncateQuantity(item.quantity)
        : null;

    if (requiredBase <= 0) {
      throw new Error(`Cantidad inválida para ${product.name}.`);
    }

    if (requiredBase - totals.totalQuantity > STOCK_EPSILON) {
      throw new Error(
        `Stock insuficiente para ${product.name}. Disponible: ${totals.totalQuantity.toFixed(2)}`
      );
    }

    if (
      requiredUnits !== null &&
      totals.totalUnits !== null &&
      requiredUnits - totals.totalUnits > STOCK_EPSILON
    ) {
      throw new Error(
        `Unidades insuficientes para ${product.name}. Disponibles: ${totals.totalUnits.toFixed(2)}`
      );
    }

    let remainingBase = requiredBase;
    let remainingUnits = requiredUnits ?? 0;

    const lineAllocations: LotAllocation[] = [];

    for (const lot of scopedLots) {
      if (remainingBase <= STOCK_EPSILON && remainingUnits <= STOCK_EPSILON) {
        break;
      }

      const availableBase = Math.max(0, lot.quantityAvailable);
      const availableUnits =
        requiredUnits !== null && lot.unitQuantityAvailable !== null
          ? Math.max(0, lot.unitQuantityAvailable)
          : 0;

      if (availableBase <= STOCK_EPSILON) {
        continue;
      }

      const unitsToConsume =
        requiredUnits !== null && remainingUnits > STOCK_EPSILON
          ? Math.min(availableUnits, remainingUnits)
          : 0;

      if (requiredUnits !== null && unitsToConsume <= STOCK_EPSILON) {
        continue;
      }

      const baseToConsume =
        remainingBase > STOCK_EPSILON
          ? Math.min(availableBase, remainingBase)
          : 0;

      if (baseToConsume <= STOCK_EPSILON) {
        continue;
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

      const nextBase = truncateQuantity(
        Math.max(0, lot.quantityAvailable - baseToConsume)
      );
      const nextUnits =
        requiredUnits !== null && lot.unitQuantityAvailable !== null
          ? truncateQuantity(
              Math.max(0, lot.unitQuantityAvailable - unitsToConsume)
            )
          : lot.unitQuantityAvailable;

      lot.quantityAvailable = nextBase;
      lot.unitQuantityAvailable = nextUnits;

      lotUpdatesById.set(lot.id, {
        id: lot.id,
        organization_id: orgId,
        product_id: lot.productId,
        lot_number: lot.lotNumber,
        expiration_date: lot.expirationDate,
        quantity_available: nextBase,
        ...(nextUnits !== null ? { unit_quantity_available: nextUnits } : {}),
        updated_at: timestamp,
      });

      movementPayloads.push({
        organization_id: orgId,
        lot_id: lot.id,
        created_by: createdBy,
        type: "OUTBOUND",
        quantity: truncateQuantity(baseToConsume),
        previous_stock: truncateQuantity(availableBase),
        new_stock: nextBase,
        unit_quantity:
          requiredUnits !== null && unitsToConsume > STOCK_EPSILON
            ? -truncateQuantity(unitsToConsume)
            : null,
        reason: movementReason,
      });

      lineAllocations.push({
        lotId: lot.id,
        consumedBase: truncateQuantity(baseToConsume),
        consumedUnits:
          requiredUnits !== null && unitsToConsume > STOCK_EPSILON
            ? truncateQuantity(unitsToConsume)
            : null,
      });

      remainingBase = truncateQuantity(
        Math.max(0, remainingBase - baseToConsume)
      );
      remainingUnits = truncateQuantity(
        Math.max(0, remainingUnits - unitsToConsume)
      );
    }

    if (remainingBase > STOCK_EPSILON || remainingUnits > STOCK_EPSILON) {
      throw new Error(
        `No se pudo asignar stock suficiente para ${product.name}.`
      );
    }

    allocationsByLine.set(item.lineId, lineAllocations);
  }

  return {
    lotUpdates: Array.from(lotUpdatesById.values()),
    rollbackLotUpdates: Array.from(rollbackByLotId.values()),
    movementPayloads,
    allocationsByLine,
  };
}

async function applyStockAdjustments(
  supabase: SupabaseServerClient,
  context: StockAdjustmentContext
): Promise<string[]> {
  if (!context.lotUpdates.length) {
    return [];
  }

  const { error: lotUpdateError } = await supabase
    .from("product_lots")
    .upsert(context.lotUpdates);

  if (lotUpdateError) {
    throw new Error(
      `No se pudo descontar stock de los lotes: ${lotUpdateError.message}`
    );
  }

  if (!context.movementPayloads.length) {
    return [];
  }

  const { data: movements, error: movementError } = await supabase
    .from("stock_movements")
    .insert(context.movementPayloads)
    .select("id");

  if (movementError) {
    await supabase.from("product_lots").upsert(context.rollbackLotUpdates);
    throw new Error(
      `No se pudo registrar el movimiento de stock: ${movementError.message}`
    );
  }

  return (movements ?? [])
    .map((movement) => movement.id)
    .filter((id): id is string => Boolean(id));
}

async function rollbackStockAdjustments(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  context: StockAdjustmentContext;
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
        "No se pudieron revertir movimientos de stock de POS",
        error
      );
    }
  }

  if (context.rollbackLotUpdates.length) {
    try {
      await supabase.from("product_lots").upsert(context.rollbackLotUpdates);
    } catch (error) {
      console.error("No se pudo revertir stock de lotes POS", error);
    }
  }
}

function buildPosSaleItemsPayload(params: {
  posSaleId: string;
  items: NormalizedPosSaleItem[];
  allocationsByLine: Map<string, LotAllocation[]>;
}): Database["public"]["Tables"]["pos_sale_items"]["Insert"][] {
  const { posSaleId, items, allocationsByLine } = params;

  const payload: Database["public"]["Tables"]["pos_sale_items"]["Insert"][] =
    [];

  for (const item of items) {
    const allocations = allocationsByLine.get(item.lineId) ?? [];

    if (!allocations.length) {
      throw new Error(
        "No se pudo determinar la asignación de lotes para un ítem."
      );
    }

    const usesUnitsMetric =
      item.weightQuantity === null &&
      allocations.some((allocation) => allocation.consumedUnits !== null);

    const totalMetric = allocations.reduce((sum, allocation) => {
      const metric = usesUnitsMetric
        ? (allocation.consumedUnits ?? 0)
        : allocation.consumedBase;
      return sum + metric;
    }, 0);

    if (totalMetric <= 0) {
      throw new Error("No se pudo distribuir el detalle por lotes.");
    }

    let remainingQuantity = item.effectiveQuantity;
    let remainingSubtotal = item.subtotal;
    let remainingDiscount = item.discountAmount;

    allocations.forEach(
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Split distribution preserves quantity and monetary remainders per lot allocation.
      (allocation, index) => {
        const isLast = index === allocations.length - 1;
        const metric = usesUnitsMetric
          ? (allocation.consumedUnits ?? 0)
          : allocation.consumedBase;
        const ratio = metric / totalMetric;

        const quantity = isLast
          ? truncateQuantity(Math.max(0, remainingQuantity))
          : truncateQuantity(Math.max(0, item.effectiveQuantity * ratio));

        const subtotal = isLast
          ? truncateMoney(Math.max(0, remainingSubtotal))
          : truncateMoney(Math.max(0, item.subtotal * ratio));

        const discountAmount = isLast
          ? truncateMoney(Math.max(0, remainingDiscount))
          : truncateMoney(Math.max(0, item.discountAmount * ratio));

        remainingQuantity = truncateQuantity(
          Math.max(0, remainingQuantity - quantity)
        );
        remainingSubtotal = truncateMoney(
          Math.max(0, remainingSubtotal - subtotal)
        );
        remainingDiscount = truncateMoney(
          Math.max(0, remainingDiscount - discountAmount)
        );

        if (quantity <= STOCK_EPSILON && subtotal <= 0 && discountAmount <= 0) {
          return;
        }

        payload.push({
          pos_sale_id: posSaleId,
          product_id: item.productId,
          lot_id: allocation.lotId,
          quantity,
          unit_price: item.unitPrice,
          subtotal,
          discount_amount: discountAmount,
          tax_rate: 0,
        });
      }
    );
  }

  if (!payload.length) {
    throw new Error(
      "No se pudieron construir ítems válidos para la venta POS."
    );
  }

  return payload;
}

async function cleanupFailedPosSale(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  posSaleId: string;
}) {
  const { supabase, orgId, posSaleId } = params;

  try {
    await supabase.from("pos_payments").delete().eq("pos_sale_id", posSaleId);
    await supabase.from("pos_sale_items").delete().eq("pos_sale_id", posSaleId);
    await supabase
      .from("pos_sales")
      .delete()
      .eq("organization_id", orgId)
      .eq("id", posSaleId);
  } catch (error) {
    console.error("No se pudo limpiar una venta POS fallida", {
      posSaleId,
      error,
    });
  }
}

export async function getPosSalesByOrgSlug(
  orgSlug: string
): Promise<PosSale[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("pos_sales")
    .select(
      `
      *,
      customer:customers(id, business_name, fantasy_name),
      session:pos_sessions(
        terminal:pos_terminals(id, name, code, cash_register_number)
      ),
      items:pos_sale_items(
        *,
        product:products(id, name, sku, unit_of_measure)
      ),
      payments:pos_payments(*)
    `
    )
    .eq("organization_id", org.id)
    .order("sale_date", { ascending: false });

  if (error) {
    throw new Error(`No se pudieron obtener ventas POS: ${error.message}`);
  }

  const sales = (data ?? []) as PosSaleRaw[];
  const [returnTotalsBySaleId, saleUsersById] = await Promise.all([
    getPosSaleReturnTotalsBySaleIds({
      supabase,
      orgId: org.id,
      saleIds: sales.map((sale) => sale.id).filter((saleId) => Boolean(saleId)),
    }),
    getSaleUsersById({
      supabase,
      orgSlug,
    }),
  ]);

  return sales.map((sale) =>
    normalizePosSale(sale, returnTotalsBySaleId.get(sale.id), saleUsersById)
  );
}

export async function getPosSaleById(
  orgSlug: string,
  posSaleId: string
): Promise<PosSaleDetail | null> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("pos_sales")
    .select(
      `
      *,
      customer:customers(id, business_name, fantasy_name),
      session:pos_sessions(
        terminal:pos_terminals(id, name, code, cash_register_number)
      ),
      items:pos_sale_items(
        *,
        product:products(id, name, sku, unit_of_measure)
      ),
      payments:pos_payments(*)
    `
    )
    .eq("organization_id", org.id)
    .eq("id", posSaleId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `No se pudo obtener el detalle de la venta POS: ${error.message}`
    );
  }

  if (!data?.id) {
    return null;
  }

  const sale = data as PosSaleRaw;
  const [returnTotalsBySaleId, returns, saleUsersById] = await Promise.all([
    getPosSaleReturnTotalsBySaleIds({
      supabase,
      orgId: org.id,
      saleIds: [sale.id],
    }),
    getPosSaleReturnRecords({
      supabase,
      orgId: org.id,
      posSaleId: sale.id,
    }),
    getSaleUsersById({
      supabase,
      orgSlug,
    }),
  ]);

  return {
    ...normalizePosSale(sale, returnTotalsBySaleId.get(sale.id), saleUsersById),
    returns,
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Product search aggregates stock totals and product metadata from multiple sources.
export async function searchPosProductsForTerminal(params: {
  orgSlug: string;
  q?: string;
  barcode?: string;
  limit?: number;
}): Promise<PosTerminalProduct[]> {
  const parsedParams = posProductSearchParamsSchema.parse({
    q: params.q,
    barcode: params.barcode,
    limit: params.limit,
  });

  const org = await getOrganizationBySlug(params.orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();
  const sanitizedBarcode = parsedParams.barcode
    .replaceAll("%", "")
    .replaceAll(",", "")
    .trim();

  let barcodeProductIds: string[] | null = null;

  if (sanitizedBarcode) {
    const { data: barcodeRows, error: barcodeError } = await supabase
      .from("products")
      .select("id")
      .eq("organization_id", org.id)
      .eq("is_active", true)
      .eq("barcode", sanitizedBarcode)
      .limit(parsedParams.limit);

    if (barcodeError) {
      throw new Error(
        `No se pudo buscar por código de barras: ${barcodeError.message}`
      );
    }

    barcodeProductIds = (barcodeRows ?? [])
      .map((row) => row.id)
      .filter((id): id is string => Boolean(id));

    if (!barcodeProductIds.length) {
      return [];
    }
  }

  let productsQuery = supabase
    .from("products_with_price")
    .select(
      "id, sku, name, brand, calculated_sale_price, unit_of_measure, organization_id, is_active"
    )
    .eq("organization_id", org.id)
    .eq("is_active", true)
    .order("name")
    .limit(parsedParams.limit);

  if (barcodeProductIds) {
    productsQuery = productsQuery.in("id", barcodeProductIds);
  } else if (parsedParams.q) {
    const searchTerm = parsedParams.q.replaceAll("%", "").replaceAll(",", "");
    productsQuery = productsQuery.or(
      `name.ilike.%${searchTerm}%,sku.ilike.%${searchTerm}%`
    );
  }

  const { data: products, error: productsError } = await productsQuery;

  if (productsError) {
    throw new Error(
      `No se pudieron obtener productos POS: ${productsError.message}`
    );
  }

  const productRows = (products ?? []).filter(
    (product) => product.id && product.name && product.sku
  );

  if (!productRows.length) {
    return [];
  }

  const productIds = productRows
    .map((product) => product.id)
    .filter((id): id is string => Boolean(id));

  const [detailsResult, lotsResult] = await Promise.all([
    supabase
      .from("products")
      .select("id, barcode, tracks_stock_units, weight_per_unit")
      .eq("organization_id", org.id)
      .in("id", productIds),
    supabase
      .from("product_lots")
      .select("product_id, quantity_available, unit_quantity_available")
      .eq("organization_id", org.id)
      .in("product_id", productIds),
  ]);

  if (detailsResult.error) {
    throw new Error(
      `No se pudieron obtener detalles de productos POS: ${detailsResult.error.message}`
    );
  }

  if (lotsResult.error) {
    throw new Error(
      `No se pudo obtener stock para productos POS: ${lotsResult.error.message}`
    );
  }

  const detailsByProduct = new Map<
    string,
    {
      barcode: string | null;
      tracksStockUnits: boolean;
      weightPerUnit: number | null;
    }
  >();

  for (const row of detailsResult.data ?? []) {
    if (!row.id) {
      continue;
    }

    detailsByProduct.set(row.id, {
      barcode: row.barcode ?? null,
      tracksStockUnits: Boolean(row.tracks_stock_units),
      weightPerUnit: row.weight_per_unit ?? null,
    });
  }

  const totalsByProduct = new Map<
    string,
    {
      totalQuantity: number;
      totalUnitQuantity: number | null;
    }
  >();

  for (const lot of lotsResult.data ?? []) {
    if (!lot.product_id) {
      continue;
    }

    const current = totalsByProduct.get(lot.product_id) ?? {
      totalQuantity: 0,
      totalUnitQuantity: null as number | null,
    };

    const nextUnits =
      current.totalUnitQuantity !== null || lot.unit_quantity_available !== null
        ? (current.totalUnitQuantity ?? 0) + (lot.unit_quantity_available ?? 0)
        : null;

    totalsByProduct.set(lot.product_id, {
      totalQuantity: current.totalQuantity + (lot.quantity_available ?? 0),
      totalUnitQuantity: nextUnits,
    });
  }

  return productRows.map((row) => {
    const productId = row.id as string;
    const details = detailsByProduct.get(productId);
    const totals = totalsByProduct.get(productId);

    return {
      id: productId,
      sku: row.sku ?? "",
      barcode: details?.barcode ?? null,
      name: row.name ?? "Producto sin nombre",
      brand: row.brand ?? null,
      price: truncateMoney(row.calculated_sale_price ?? 0),
      unitOfMeasure:
        (row.unit_of_measure as Database["public"]["Enums"]["unit_of_measure_type"]) ||
        "UN",
      tracksStockUnits: details?.tracksStockUnits ?? false,
      weightPerUnit: details?.weightPerUnit ?? null,
      totalQuantity: truncateQuantity(totals?.totalQuantity ?? 0),
      totalUnitQuantity:
        totals?.totalUnitQuantity !== null &&
        totals?.totalUnitQuantity !== undefined
          ? truncateQuantity(totals.totalUnitQuantity)
          : null,
    };
  });
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: POS checkout orchestrates multiple persistence steps with compensating rollback.
export async function createPosSale(
  input: CreatePosSaleInput
): Promise<CreatePosSaleResult> {
  const parsed = createPosSaleSchema.safeParse(input);

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      issue?.message ?? "Datos inválidos para registrar la venta POS."
    );
  }

  const payload = parsed.data;

  const org = await getOrganizationBySlug(payload.orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();
  const userId = await getCurrentUserId(supabase);
  const sessionId = await getOpenSessionForTerminal({
    supabase,
    orgId: org.id,
    userId,
    terminalId: payload.terminalId,
  });

  const items = normalizePosItems(payload.items);

  const subtotalAmount = truncateMoney(
    items.reduce((sum, item) => sum + item.subtotal, 0)
  );

  const lineDiscountAmount = truncateMoney(
    items.reduce((sum, item) => sum + item.discountAmount, 0)
  );

  const globalDiscountPercentage = Number.isFinite(
    payload.globalDiscountPercentage
  )
    ? clampPercentage(Number(payload.globalDiscountPercentage))
    : 0;

  const globalDiscountAmount = truncateMoney(
    (globalDiscountPercentage / 100) * Math.max(0, subtotalAmount)
  );

  const discountedSubtotal = truncateMoney(
    Math.max(0, subtotalAmount - globalDiscountAmount)
  );

  const totalTaxAmount = truncateMoney(
    (payload.taxes ?? []).reduce(
      (sum, tax) => sum + discountedSubtotal * (tax.rate / 100),
      0
    )
  );

  const totalAmount = truncateMoney(
    Math.max(0, discountedSubtotal + totalTaxAmount)
  );

  const saleDate = toSaleDateTime(payload.saleDate);
  const receiptNumber = buildReceiptNumber();

  const { data: posSale, error: posSaleError } = await supabase
    .from("pos_sales")
    .insert({
      organization_id: org.id,
      session_id: sessionId,
      user_id: userId,
      customer_id: payload.customerId ?? null,
      subtotal_amount: subtotalAmount,
      discount_amount: truncateMoney(lineDiscountAmount + globalDiscountAmount),
      tax_amount: totalTaxAmount,
      total_amount: totalAmount,
      sale_date: saleDate,
      receipt_number: receiptNumber,
      status: "COMPLETED",
    })
    .select("id")
    .maybeSingle();

  if (posSaleError) {
    throw new Error(
      `No se pudo registrar la cabecera de la venta POS: ${posSaleError.message}`
    );
  }

  if (!posSale?.id) {
    throw new Error("No se pudo obtener el ID de la venta POS.");
  }

  const posSaleId = posSale.id;
  let stockContext: StockAdjustmentContext | null = null;
  let movementIds: string[] = [];

  try {
    stockContext = await buildStockAdjustmentContext({
      supabase,
      orgId: org.id,
      items,
      movementReason: `Venta POS ${receiptNumber}`,
      createdBy: userId,
    });

    const itemsPayload = buildPosSaleItemsPayload({
      posSaleId,
      items,
      allocationsByLine: stockContext.allocationsByLine,
    });

    const { error: itemsError } = await supabase
      .from("pos_sale_items")
      .insert(itemsPayload);

    if (itemsError) {
      throw new Error(
        `No se pudieron guardar los ítems de la venta POS: ${itemsError.message}`
      );
    }

    const paymentCandidates = resolvePaymentMethodCandidates(
      payload.paymentMethod
    );

    let insertedPaymentMethod: PosPaymentMethodValue | null = null;
    let paymentInsertError: string | null = null;

    for (const paymentMethod of paymentCandidates) {
      const { error: paymentError } = await supabase
        .from("pos_payments")
        .insert({
          pos_sale_id: posSaleId,
          payment_method: paymentMethod as PosPaymentMethodInsertValue,
          amount: totalAmount,
          reference_number: sanitizeText(payload.paymentReference),
          card_brand: sanitizeText(payload.cardBrand),
        });

      if (!paymentError) {
        insertedPaymentMethod = paymentMethod;
        paymentInsertError = null;
        break;
      }

      paymentInsertError = paymentError.message;

      if (!isEnumInputError(paymentError)) {
        break;
      }
    }

    if (paymentInsertError || !insertedPaymentMethod) {
      throw new Error(
        `No se pudo registrar el pago de la venta POS: ${paymentInsertError ?? "método no soportado"}`
      );
    }

    movementIds = await applyStockAdjustments(supabase, stockContext);

    if (isCashPayment(insertedPaymentMethod)) {
      await increaseSessionCashTotals({
        supabase,
        orgId: org.id,
        sessionId,
        amount: totalAmount,
      });
    }

    return {
      posSaleId,
    };
  } catch (error) {
    if (stockContext && movementIds.length > 0) {
      await rollbackStockAdjustments({
        supabase,
        orgId: org.id,
        context: stockContext,
        movementIds,
      });
    }

    await cleanupFailedPosSale({
      supabase,
      orgId: org.id,
      posSaleId,
    });

    throw error;
  }
}

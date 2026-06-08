import { createClient } from "@/lib/supabase/server";
import {
  getDirectSaleConfigByOrgSlug,
  getOrganizationBySlug,
} from "@/modules/organizations/service/organizations.service";
import type { Database } from "@/types/supabase";
import type {
  CreateDirectSaleInput,
  CreateDirectSaleResult,
  DirectSaleItemInput,
  PosSale,
} from "../types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type PosPaymentMethodInsertValue =
  Database["public"]["Tables"]["pos_payments"]["Insert"]["payment_method"];

type PosPaymentMethodValue = string;
type PosInvoiceType = Database["public"]["Enums"]["invoice_type_enum"];
type PosArcaInvoiceType = "FACTURA_B" | "FACTURA_C";

type PosSaleRaw = Database["public"]["Tables"]["pos_sales"]["Row"] & {
  customer?: {
    id?: string | null;
    business_name?: string | null;
    fantasy_name?: string | null;
  } | null;
  items?:
    | (Database["public"]["Tables"]["pos_sale_items"]["Row"] & {
        product?: {
          id?: string | null;
          name?: string | null;
          sku?: string | null;
        } | null;
      })[]
    | null;
  payments?: Database["public"]["Tables"]["pos_payments"]["Row"][] | null;
};

type OrganizationMemberWithUser =
  Database["public"]["Functions"]["get_organization_members_with_users"]["Returns"][number];

type PosSaleUsersById = Map<string, NonNullable<PosSale["user"]>>;

type NormalizedDirectSaleItem = {
  productId: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  subtotal: number;
  lotId: string | null;
};

const MAX_RECEIPT_SUFFIX = 1_000_000;

const paymentMethodCandidates: Record<
  NonNullable<CreateDirectSaleInput["paymentMethod"]>,
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

  const rawValue = value.trim();

  if (!rawValue) {
    return new Date().toISOString();
  }

  const withTime = rawValue.includes("T") ? rawValue : `${rawValue}T12:00:00`;
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

function isPosArcaInvoiceType(
  value: string | null
): value is PosArcaInvoiceType {
  return value === "FACTURA_B" || value === "FACTURA_C";
}

function resolvePersistedPosInvoiceType(value: string | null): PosInvoiceType {
  return isPosArcaInvoiceType(value) ? value : "TICKET_X";
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
      `No se pudieron obtener miembros para ventas directas POS: ${membersResult.error.message}`
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
      `No se pudo obtener usuario autenticado para ventas directas POS: ${currentUserResult.error.message}`
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

function normalizeDirectSaleItems(
  items: DirectSaleItemInput[]
): NormalizedDirectSaleItem[] {
  const resolveQuantity = (
    item: DirectSaleItemInput,
    index: number
  ): number => {
    const quantityFromWeight =
      item.weightQuantity !== null &&
      item.weightQuantity !== undefined &&
      Number.isFinite(item.weightQuantity) &&
      item.weightQuantity > 0
        ? Number(item.weightQuantity)
        : null;

    const quantity = quantityFromWeight ?? Number(item.quantity);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(
        `El ítem #${index + 1} tiene una cantidad inválida (debe ser mayor a 0)`
      );
    }

    return quantity;
  };

  const resolveDiscountAmount = (
    item: DirectSaleItemInput,
    grossAmount: number
  ): number => {
    const discountFromAmount = Number(item.discountAmount);
    const discountFromPercentage = Number(item.discountPercentage);

    if (Number.isFinite(discountFromAmount)) {
      return Math.max(0, discountFromAmount);
    }

    if (Number.isFinite(discountFromPercentage)) {
      return (clampPercentage(discountFromPercentage) / 100) * grossAmount;
    }

    return 0;
  };

  const normalized = items.map((item, index) => {
    const productId = item.productId?.trim();

    if (!productId) {
      throw new Error(`El ítem #${index + 1} no tiene producto seleccionado`);
    }

    const quantity = resolveQuantity(item, index);

    const unitPrice = Number(item.unitPrice);

    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new Error(
        `El ítem #${index + 1} tiene un precio inválido (debe ser mayor o igual a 0)`
      );
    }

    const gross = quantity * unitPrice;
    const discountAmount = resolveDiscountAmount(item, gross);

    const safeDiscountAmount = Math.min(discountAmount, gross);

    return {
      productId,
      quantity,
      unitPrice,
      discountAmount: safeDiscountAmount,
      subtotal: Math.max(0, gross - safeDiscountAmount),
      lotId: item.lotId ?? null,
    };
  });

  if (!normalized.length) {
    throw new Error("Agrega al menos un producto a la venta directa");
  }

  return normalized;
}

function resolvePaymentMethodCandidates(
  paymentMethod?: CreateDirectSaleInput["paymentMethod"]
): PosPaymentMethodValue[] {
  const candidates = paymentMethod
    ? (paymentMethodCandidates[paymentMethod] ??
      paymentMethodCandidates.efectivo)
    : paymentMethodCandidates.efectivo;

  return [...new Set(candidates)];
}

function isCashPayment(paymentMethod: PosPaymentMethodValue): boolean {
  if (!paymentMethod) {
    return false;
  }

  const normalized = paymentMethod.toLowerCase();
  return normalized === "cash" || normalized === "efectivo";
}

async function getOpenSessionOrThrow(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  userId: string;
}): Promise<string> {
  const { supabase, orgId, userId } = params;

  const { data: openSession, error: openSessionError } = await supabase
    .from("pos_sessions")
    .select("id")
    .eq("organization_id", orgId)
    .eq("user_id", userId)
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
    "No hay una caja abierta. Debes hacer una apertura de caja antes de registrar ventas."
  );
}

async function increaseSessionCashTotals(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  sessionId: string;
  amount: number;
}) {
  const { supabase, orgId, sessionId, amount } = params;

  if (!(Number.isFinite(amount) && amount > 0)) {
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
      cash_sales_amount: (session.cash_sales_amount ?? 0) + amount,
      expected_cash_end: (session.expected_cash_end ?? 0) + amount,
    })
    .eq("organization_id", orgId)
    .eq("id", sessionId);
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
      items:pos_sale_items(
        *,
        product:products(id, name, sku)
      ),
      payments:pos_payments(*)
    `
    )
    .eq("organization_id", org.id)
    .order("sale_date", { ascending: false });

  if (error) {
    throw new Error(
      `No se pudieron obtener las ventas directas: ${error.message}`
    );
  }

  const sales = (data ?? []) as PosSaleRaw[];
  const saleUsersById = await getSaleUsersById({
    supabase,
    orgSlug,
  });

  return sales.map((sale) => ({
    ...sale,
    customer: sale.customer?.id
      ? {
          id: sale.customer.id,
          business_name: sale.customer.business_name ?? "Consumidor final",
          fantasy_name: sale.customer.fantasy_name ?? null,
        }
      : null,
    items: (sale.items ?? []).map((item) => ({
      ...item,
      product: item.product?.id
        ? {
            id: item.product.id,
            name: item.product.name ?? "Producto sin nombre",
            sku: item.product.sku ?? "",
          }
        : null,
    })),
    payments: sale.payments ?? [],
    user: sale.user_id
      ? (saleUsersById.get(sale.user_id) ?? {
          id: sale.user_id,
          name: getFallbackUserLabel(sale.user_id),
          email: null,
        })
      : null,
  }));
}

export async function createDirectSale(
  input: CreateDirectSaleInput
): Promise<CreateDirectSaleResult> {
  const { orgSlug, saleDate } = input;

  if (!saleDate) {
    throw new Error("La fecha de venta es requerida");
  }

  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const directSaleConfig = await getDirectSaleConfigByOrgSlug(orgSlug);
  const persistedInvoiceType = resolvePersistedPosInvoiceType(
    directSaleConfig.sales_default_invoice_type
  );

  const supabase = await createClient();
  const userId = await getCurrentUserId(supabase);
  const sessionId = await getOpenSessionOrThrow({
    supabase,
    orgId: org.id,
    userId,
  });

  const normalizedItems = normalizeDirectSaleItems(input.items);

  const subtotalAmount = normalizedItems.reduce(
    (sum, item) => sum + item.subtotal,
    0
  );
  const lineDiscountAmount = normalizedItems.reduce(
    (sum, item) => sum + item.discountAmount,
    0
  );

  const globalDiscountPercentage = Number.isFinite(
    input.globalDiscountPercentage
  )
    ? clampPercentage(Number(input.globalDiscountPercentage))
    : 0;
  const globalDiscountAmount =
    (globalDiscountPercentage / 100) * Math.max(0, subtotalAmount);

  const discountedSubtotal = Math.max(0, subtotalAmount - globalDiscountAmount);

  const taxDetails = (input.taxes ?? []).map((tax) => ({
    baseAmount: discountedSubtotal,
    taxAmount: discountedSubtotal * (tax.rate / 100),
  }));

  const totalTaxAmount = taxDetails.reduce(
    (sum, tax) => sum + tax.taxAmount,
    0
  );
  const totalAmount = Math.max(0, discountedSubtotal + totalTaxAmount);

  const saleDateTime = toSaleDateTime(saleDate);
  const receiptNumber = buildReceiptNumber();

  const { data: posSale, error: posSaleError } = await supabase
    .from("pos_sales")
    .insert({
      organization_id: org.id,
      session_id: sessionId,
      user_id: userId,
      customer_id: input.customerId ?? null,
      subtotal_amount: subtotalAmount,
      discount_amount: lineDiscountAmount + globalDiscountAmount,
      tax_amount: totalTaxAmount,
      total_amount: totalAmount,
      sale_date: saleDateTime,
      receipt_number: receiptNumber,
      invoice_type: persistedInvoiceType,
      status: "COMPLETED",
    })
    .select("id")
    .maybeSingle();

  if (posSaleError) {
    throw new Error(
      `No se pudo registrar la cabecera de la venta directa: ${posSaleError.message}`
    );
  }

  if (!posSale?.id) {
    throw new Error("No se pudo obtener el ID de la venta directa");
  }

  const posSaleId = posSale.id;

  const itemsPayload: Database["public"]["Tables"]["pos_sale_items"]["Insert"][] =
    normalizedItems.map((item) => ({
      pos_sale_id: posSaleId,
      product_id: item.productId,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      subtotal: item.subtotal,
      discount_amount: item.discountAmount,
      tax_rate: 0,
      lot_id: item.lotId,
    }));

  const { error: itemsError } = await supabase
    .from("pos_sale_items")
    .insert(itemsPayload);

  if (itemsError) {
    await supabase
      .from("pos_sales")
      .delete()
      .eq("organization_id", org.id)
      .eq("id", posSaleId);

    throw new Error(
      `No se pudieron guardar los ítems de la venta directa: ${itemsError.message}`
    );
  }

  const paymentCandidates = resolvePaymentMethodCandidates(input.paymentMethod);

  let paymentInsertError: string | null = null;
  let insertedPaymentMethod: PosPaymentMethodValue | null = null;

  for (const paymentMethod of paymentCandidates) {
    const { error: paymentError } = await supabase.from("pos_payments").insert({
      pos_sale_id: posSaleId,
      payment_method: paymentMethod as PosPaymentMethodInsertValue,
      amount: totalAmount,
      reference_number: sanitizeText(input.paymentReference),
      card_brand: sanitizeText(input.cardBrand),
    });

    if (!paymentError) {
      insertedPaymentMethod = paymentMethod;
      paymentInsertError = null;
      break;
    }

    paymentInsertError = paymentError.message;
  }

  if (paymentInsertError) {
    await supabase.from("pos_sale_items").delete().eq("pos_sale_id", posSaleId);

    await supabase
      .from("pos_sales")
      .delete()
      .eq("organization_id", org.id)
      .eq("id", posSaleId);

    throw new Error(
      `No se pudo registrar el pago de la venta directa: ${paymentInsertError}`
    );
  }

  if (insertedPaymentMethod && isCashPayment(insertedPaymentMethod)) {
    await increaseSessionCashTotals({
      supabase,
      orgId: org.id,
      sessionId,
      amount: totalAmount,
    });
  }

  return { posSaleId };
}

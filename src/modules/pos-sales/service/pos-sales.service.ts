import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { Database } from "@/types/supabase";
import type {
  CreateDirectSaleInput,
  CreateDirectSaleResult,
  DirectSaleItemInput,
  PosSale,
} from "../types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type PosPaymentMethodValue =
  | Database["public"]["Enums"]["payment_method"]
  | Database["public"]["Enums"]["payment_method_type"];

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
  efectivo: ["efectivo", "EFECTIVO"],
  tarjeta_de_credito: ["tarjeta de credito", "TARJETA_CREDITO"],
  tarjeta_de_debito: ["tarjeta de debito", "TARJETA_DEBITO"],
  transferencia: ["transferencia", "TRANSFERENCIA"],
  cheque: ["cheque", "CHEQUE"],
  deposito: ["transferencia", "TRANSFERENCIA", "OTRO"],
  "e-cheq": ["cheque", "CHEQUE"],
};

function clampPercentage(value: number): number {
  return Math.min(Math.max(value, 0), 100);
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
  if (!paymentMethod) {
    return paymentMethodCandidates.efectivo;
  }

  return (
    paymentMethodCandidates[paymentMethod] ?? paymentMethodCandidates.efectivo
  );
}

function isCashPayment(
  paymentMethod: PosPaymentMethodValue
): paymentMethod is "efectivo" | "EFECTIVO" {
  return paymentMethod === "efectivo" || paymentMethod === "EFECTIVO";
}

async function getOrCreateOpenSession(params: {
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

  const { data: terminal, error: terminalError } = await supabase
    .from("pos_terminals")
    .select("id")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (terminalError) {
    throw new Error(
      `No se pudo obtener una terminal POS activa: ${terminalError.message}`
    );
  }

  if (!terminal?.id) {
    throw new Error(
      "No hay terminales POS activas configuradas. Configura una terminal para registrar ventas directas."
    );
  }

  const { data: createdSession, error: createdSessionError } = await supabase
    .from("pos_sessions")
    .insert({
      organization_id: orgId,
      terminal_id: terminal.id,
      user_id: userId,
      status:
        "OPEN" satisfies Database["public"]["Enums"]["pos_session_status"],
      starting_cash: 0,
      cash_sales_amount: 0,
      expected_cash_end: 0,
    })
    .select("id")
    .maybeSingle();

  if (createdSessionError) {
    throw new Error(
      `No se pudo abrir automáticamente una sesión POS: ${createdSessionError.message}`
    );
  }

  if (!createdSession?.id) {
    throw new Error("No se pudo obtener la sesión POS creada");
  }

  return createdSession.id;
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

  const supabase = await createClient();
  const userId = await getCurrentUserId(supabase);
  const sessionId = await getOrCreateOpenSession({
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
      customer_id: input.customerId ?? null,
      subtotal_amount: subtotalAmount,
      discount_amount: lineDiscountAmount + globalDiscountAmount,
      tax_amount: totalTaxAmount,
      total_amount: totalAmount,
      sale_date: saleDateTime,
      receipt_number: receiptNumber,
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
      payment_method: paymentMethod,
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

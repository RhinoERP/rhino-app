"use server";

import { revalidatePath } from "next/cache";
import { buildCobro, buildOrdenPago } from "@/lib/accounting-client";
import {
  confirmAccountingEvent,
  createChequeEmitidoServer,
  endorseReceivedChecksForPayableServer,
  previewAccountingEvent,
} from "@/lib/accounting-server";
import { truncateMoney } from "@/lib/decimal";
import { requireAuth } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { isAccountingIntegrationEnabled } from "@/modules/accounting/service/accounting-integration.service";
import type { AnyEvento } from "@/modules/accounting/types";
import {
  deriveReceivableCreditSupplier,
  generateCommissions,
} from "@/modules/collections/service/collections.service";
import {
  assertPaymentExchangeRate,
  type PaymentCurrencyFields,
  resolvePaymentCurrencyFields,
} from "@/modules/collections/utils/payment-currency";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";
import { getOrgSettings } from "@/modules/organizations/service/org-settings.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { Database } from "@/types/supabase";
import type {
  CollectionAccountStatus,
  PaymentMethod,
  RegisterPaymentInput,
  RegisterPaymentResult,
} from "../types";

type PayableAccountRow = {
  id: string;
  organization_id: string;
  total_amount: number;
  pending_balance: number;
  status?: string | null;
  supplier_id: string;
  currency?: string | null;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type PaymentInsertRow = {
  id: string;
  organization_id: string;
  account_receivable_id?: string | null;
  account_payable_id?: string | null;
  amount: number;
  currency?: string;
  exchange_rate?: number | null;
  amount_ars?: number | null;
  payment_method: string;
  payment_date: string;
  reference_number?: string | null;
};

type RegisterPaymentErrorCode = Extract<
  RegisterPaymentResult,
  { success: false }
>["code"];

const deriveStatus = (
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

const sanitize = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const toDateOnly = (value?: string | null) => {
  if (!value) {
    return new Date().toISOString().split("T")[0];
  }
  return value;
};

const paymentMethodMap: Record<
  PaymentMethod,
  Database["public"]["Enums"]["payment_method_type"] | string
> = {
  efectivo: "efectivo",
  transferencia: "transferencia",
  cheque: "cheque",
  cheque_endosado: "cheque",
  tarjeta_de_credito: "tarjeta de credito",
  tarjeta_de_debito: "tarjeta de debito",
  deposito: "deposito",
  "e-cheq": "e-cheq",
};

const resolvePaymentMethod = (
  method: PaymentMethod
): Database["public"]["Enums"]["payment_method_type"] =>
  (paymentMethodMap[method] ??
    "efectivo") as Database["public"]["Enums"]["payment_method_type"];

const toBuilderPaymentMethod = (method: string): PaymentMethod => {
  switch (method) {
    case "efectivo":
      return "efectivo";
    case "transferencia":
      return "transferencia";
    case "cheque":
    case "cheque_endosado":
      return "cheque";
    case "tarjeta de credito":
      return "tarjeta_de_credito";
    case "tarjeta de debito":
      return "tarjeta_de_debito";
    case "deposito":
      return "deposito";
    case "e-cheq":
      return "e-cheq";
    default:
      return "efectivo";
  }
};

const toReceivableStatus = (
  status: CollectionAccountStatus
): Database["public"]["Enums"]["receivable_status"] => {
  switch (status) {
    case "PAID":
      return "PAID";
    case "PARTIAL":
      return "PARTIALLY_PAID";
    default:
      return "PENDING";
  }
};

type PaymentTotalsResult =
  | {
      success: true;
      creditToApply: number;
      newPendingBalance: number;
      newStatus: CollectionAccountStatus;
      creditGenerated: number;
      accountingEvent?: AnyEvento;
      accountingInformalEntryId?: string;
      paymentId?: string;
    }
  | {
      success: false;
      error: string;
      code?: "amount_exceeds_pending";
    };

const computePaymentTotals = ({
  pendingBalance,
  totalAmount,
  amount,
  creditAmount,
}: {
  pendingBalance: number;
  totalAmount: number;
  amount: number;
  creditAmount: number;
}): PaymentTotalsResult => {
  const normalizedPendingBalance = truncateMoney(pendingBalance);
  const normalizedTotalAmount = truncateMoney(totalAmount);
  const normalizedAmount = truncateMoney(amount);
  const normalizedCreditAmount = truncateMoney(creditAmount);

  if (normalizedCreditAmount > normalizedPendingBalance) {
    return {
      success: false,
      error: "El crédito excede el saldo pendiente",
      code: "amount_exceeds_pending",
    };
  }

  const totalApplied = truncateMoney(normalizedAmount + normalizedCreditAmount);
  const creditGenerated = truncateMoney(
    Math.max(0, totalApplied - normalizedPendingBalance)
  );

  const creditToApply = truncateMoney(
    Math.max(0, Math.min(normalizedCreditAmount, normalizedPendingBalance))
  );
  const newPendingBalance = truncateMoney(
    Math.max(0, normalizedPendingBalance - totalApplied)
  );
  const newStatus = deriveStatus(normalizedTotalAmount, newPendingBalance);

  return {
    success: true,
    creditToApply,
    newPendingBalance,
    newStatus,
    creditGenerated,
    accountingEvent: undefined,
    accountingInformalEntryId: undefined,
    paymentId: undefined,
  };
};

async function persistPaymentAccounting(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  paymentTable: "receivable_payments" | "payable_payments";
  paymentId: string;
  accountingEvent: AnyEvento;
  sourceType: "COBRO" | "ORDEN_PAGO";
  accountingIntegrationEnabled: boolean;
  automaticAccountingEnabled: boolean;
}): Promise<{
  accountingEvent?: AnyEvento;
  paymentId: string;
}> {
  if (!params.accountingIntegrationEnabled) {
    return {
      accountingEvent: params.accountingEvent,
      paymentId: params.paymentId,
    };
  }

  if (params.automaticAccountingEnabled) {
    try {
      const preview = await previewAccountingEvent(params.accountingEvent);
      if (preview.estadoImputacion === "COMPLETO") {
        await confirmAccountingEvent(params.accountingEvent);
        return { paymentId: params.paymentId };
      }
    } catch {
      // asiento automático no disponible, revisión manual
    }
  }

  // Cuando el asiento no se puede automatizar, devolver el evento para revisión
  // manual. El modal del cliente confirmará el asiento formal directamente.
  return {
    accountingEvent: params.accountingEvent,
    paymentId: params.paymentId,
  };
}

const sumRemainingAmounts = (credits: Array<{ remaining_amount: number }>) =>
  credits.reduce(
    (sum, credit) =>
      truncateMoney(sum + truncateMoney(Number(credit.remaining_amount ?? 0))),
    0
  );

function getSupplierCreditScopeError(
  supplierDifferentiatedCredits: boolean | undefined,
  supplierId: string | null | undefined
) {
  return supplierDifferentiatedCredits && !supplierId
    ? "No se pudo determinar el proveedor asociado a esta venta. No se pueden aplicar créditos."
    : null;
}

const applyCustomerCredits = async ({
  supabase,
  orgId,
  customerId,
  creditToApply,
  accountReceivableId,
  paymentDate,
  referenceNumber,
  notes,
  supplierId,
  supplierDifferentiatedCredits,
  customerCreditId,
  currency,
}: {
  supabase: SupabaseServerClient;
  orgId: string;
  customerId: string;
  creditToApply: number;
  accountReceivableId: string | null;
  paymentDate: string;
  referenceNumber: string | null;
  notes: string | null;
  supplierId?: string | null;
  supplierDifferentiatedCredits?: boolean;
  customerCreditId?: string | null;
  currency: string;
}) => {
  if (creditToApply <= 0) {
    return null;
  }

  let query = supabase
    .from("customer_credits")
    .select("id, remaining_amount")
    .eq("organization_id", orgId)
    .eq("customer_id", customerId)
    .eq("currency", currency)
    .gt("remaining_amount", 0)
    .order("created_at", { ascending: true });

  if (customerCreditId) {
    query = query.eq("id", customerCreditId);
  }

  const supplierScopeError = getSupplierCreditScopeError(
    supplierDifferentiatedCredits,
    supplierId
  );
  if (supplierScopeError) {
    return supplierScopeError;
  }
  if (supplierDifferentiatedCredits) {
    query = query.eq("supplier_id", supplierId as string);
  }

  const { data: credits, error: creditsError } = await query;

  if (creditsError || !credits) {
    return "No se pudo obtener los créditos disponibles";
  }

  const totalAvailable = sumRemainingAmounts(credits);

  if (totalAvailable < creditToApply) {
    return `Crédito insuficiente. Disponible: $${truncateMoney(totalAvailable).toFixed(2)}`;
  }

  let remainingToApply = creditToApply;
  const applications: Array<{ customerCreditId: string; amount: number }> = [];

  for (const credit of credits) {
    if (remainingToApply <= 0) {
      break;
    }

    const availableAmount = truncateMoney(Number(credit.remaining_amount ?? 0));
    const amountToUse = truncateMoney(
      Math.min(remainingToApply, availableAmount)
    );
    const newRemaining = truncateMoney(
      Math.max(0, availableAmount - amountToUse)
    );

    const { error: updateCreditError } = await supabase
      .from("customer_credits")
      .update({
        remaining_amount: truncateMoney(newRemaining),
      })
      .eq("id", credit.id)
      .eq("organization_id", orgId);

    if (updateCreditError) {
      return `Error al aplicar crédito: ${updateCreditError.message}`;
    }

    remainingToApply = truncateMoney(remainingToApply - amountToUse);
    applications.push({ customerCreditId: credit.id, amount: amountToUse });
  }

  const { error: insertError } = await supabase
    .from("customer_credit_applications")
    .insert(
      applications.map((application) => ({
        organization_id: orgId,
        customer_id: customerId,
        customer_credit_id: application.customerCreditId,
        account_receivable_id: accountReceivableId,
        amount: application.amount,
        payment_date: paymentDate,
        reference_number: referenceNumber,
        notes,
      }))
    );

  if (insertError) {
    return `Error al registrar aplicacion de credito: ${insertError.message}`;
  }

  return null;
};

const createCustomerOverpaymentCredit = async (params: {
  supabase: SupabaseServerClient;
  orgId: string;
  customerId: string;
  supplierId: string | null;
  creditGenerated: number;
  notes: string | null;
  currency: string;
}) => {
  if (params.creditGenerated <= 0) {
    return;
  }

  await params.supabase.from("customer_credits").insert({
    organization_id: params.orgId,
    customer_id: params.customerId,
    supplier_id: params.supplierId,
    amount: params.creditGenerated,
    remaining_amount: params.creditGenerated,
    currency: params.currency,
    source_payment_id: null,
    notes: params.notes
      ? `Saldo a favor por sobrepago — ${params.notes}`
      : "Saldo a favor por sobrepago",
  });
};

async function syncSalesAdvanceAfterReceivablePayment(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  saleId: string | null;
  nextStatus: CollectionAccountStatus;
  paymentId?: string;
}) {
  if (!(params.saleId && params.nextStatus === "PAID")) {
    return;
  }

  // biome-ignore lint/suspicious/noExplicitAny: generated Supabase types are refreshed with the migration.
  const advances = params.supabase.from("sales_advances" as never) as any;
  const { data: advanceDocument } = await advances
    .select("id")
    .eq("organization_id", params.orgId)
    .eq("advance_sales_order_id", params.saleId)
    .maybeSingle();

  if (advanceDocument?.id) {
    await advances
      .update({ status: "PAID", paid_at: new Date().toISOString() })
      .eq("organization_id", params.orgId)
      .eq("advance_sales_order_id", params.saleId)
      .in("status", ["INVOICED", "ISSUE_SUBMITTED", "FAILED_RECOVERABLE"]);
    return;
  }

  // A partial advance remains in CREDIT_APPLIED until the ordinary residual
  // payment is recorded. A 100% advance is settled atomically by the credit RPC.
  if (!params.paymentId) {
    return;
  }

  await advances
    .update({
      status: "SETTLED",
      settled_at: new Date().toISOString(),
      settlement_payment_id: params.paymentId ?? null,
    })
    .eq("organization_id", params.orgId)
    .eq("final_sales_order_id", params.saleId)
    .eq("status", "CREDIT_APPLIED");
}

const createSupplierOverpaymentCredit = async (params: {
  supabase: SupabaseServerClient;
  orgId: string;
  supplierId: string;
  creditGenerated: number;
  notes: string | null;
  currency: string;
}) => {
  if (params.creditGenerated <= 0) {
    return;
  }

  await params.supabase.from("supplier_credits" as never).insert({
    organization_id: params.orgId,
    supplier_id: params.supplierId,
    amount: params.creditGenerated,
    remaining_amount: params.creditGenerated,
    currency: params.currency === "USD" ? "USD" : "ARS",
    source_payment_id: null,
    notes: params.notes
      ? `Saldo a favor por sobrepago — ${params.notes}`
      : "Saldo a favor por sobrepago",
  } as never);
};

const applySupplierCredits = async ({
  supabase,
  orgId,
  supplierId,
  creditToApply,
  currency,
}: {
  supabase: SupabaseServerClient;
  orgId: string;
  supplierId: string;
  creditToApply: number;
  currency: string;
}) => {
  if (creditToApply <= 0) {
    return null;
  }

  const { data: credits, error: creditsError } = await supabase
    .from("supplier_credits" as never)
    .select("id, remaining_amount")
    .eq("organization_id", orgId)
    .eq("supplier_id", supplierId)
    .eq("currency", currency)
    .gt("remaining_amount", 0)
    .order("created_at", { ascending: true });

  if (creditsError || !credits) {
    return "No se pudo obtener los créditos disponibles";
  }

  const totalAvailable = sumRemainingAmounts(
    credits as Array<{ remaining_amount: number }>
  );

  if (totalAvailable < creditToApply) {
    return `Crédito insuficiente. Disponible: $${truncateMoney(totalAvailable).toFixed(2)}`;
  }

  let remainingToApply = creditToApply;

  for (const credit of credits as Array<{
    id: string;
    remaining_amount: number;
  }>) {
    if (remainingToApply <= 0) {
      break;
    }

    const availableAmount = truncateMoney(Number(credit.remaining_amount ?? 0));
    const amountToUse = truncateMoney(
      Math.min(remainingToApply, availableAmount)
    );
    const newRemaining = truncateMoney(
      Math.max(0, availableAmount - amountToUse)
    );

    const { error: updateCreditError } = await supabase
      .from("supplier_credits" as never)
      .update({
        remaining_amount: truncateMoney(newRemaining),
      } as never)
      .eq("id", credit.id)
      .eq("organization_id", orgId);

    if (updateCreditError) {
      return `Error al aplicar crédito: ${updateCreditError.message}`;
    }

    remainingToApply = truncateMoney(remainingToApply - amountToUse);
  }

  return null;
};

async function createReceivablePaymentWithAccounting(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  receivable: {
    id: string;
    customer_id: string;
    sales_order_id?: string | null;
  };
  amount: number;
  currencyFields: PaymentCurrencyFields;
  paymentMethodValue: Database["public"]["Enums"]["payment_method_type"];
  paymentDate: string;
  referenceNumber: string | null;
  notes: string | null;
  accountingIntegrationEnabled: boolean;
  automaticAccountingEnabled: boolean;
  commissionsEnabled: boolean;
}): Promise<
  | {
      success: true;
      accountingEvent?: AnyEvento;
      accountingInformalEntryId?: string;
      paymentId: string;
    }
  | {
      success: false;
      error: string;
    }
> {
  const { data: insertedPayment, error: insertError } = await params.supabase
    .from("receivable_payments")
    .insert({
      organization_id: params.orgId,
      account_receivable_id: params.receivable.id,
      amount: truncateMoney(params.amount),
      currency: params.currencyFields.currency,
      exchange_rate: params.currencyFields.exchangeRate,
      amount_ars: params.currencyFields.amountArs,
      payment_method: params.paymentMethodValue,
      payment_date: params.paymentDate,
      reference_number: params.referenceNumber,
      notes: params.notes,
    })
    .select(
      "id, organization_id, account_receivable_id, amount, payment_method, payment_date, reference_number"
    )
    .single();

  if (insertError) {
    return {
      success: false,
      error: `No se pudo registrar el pago: ${insertError.message}`,
    };
  }

  const payment = insertedPayment as PaymentInsertRow;

  if (params.commissionsEnabled && payment.account_receivable_id) {
    await generateCommissions(params.supabase, params.orgId, [
      {
        id: payment.id,
        account_receivable_id: payment.account_receivable_id,
        amount: params.currencyFields.amountArs,
      },
    ]);
  }

  if (!params.accountingIntegrationEnabled) {
    return {
      success: true,
      paymentId: payment.id,
    };
  }

  const builtAccountingEvent = buildCobro(
    {
      ...payment,
      amount: params.currencyFields.amountArs,
      payment_method: toBuilderPaymentMethod(payment.payment_method),
    },
    {
      customer_id: params.receivable.customer_id,
      sales_order_id: params.receivable.sales_order_id ?? null,
    },
    params.currencyFields.currency === "USD"
      ? {
          moneda: "USD",
          tipoCambio: params.currencyFields.exchangeRate,
          montoUSD: truncateMoney(params.amount),
        }
      : undefined
  );

  const accountingPersistence = await persistPaymentAccounting({
    supabase: params.supabase,
    orgId: params.orgId,
    paymentTable: "receivable_payments",
    paymentId: payment.id,
    accountingEvent: builtAccountingEvent,
    sourceType: "COBRO",
    accountingIntegrationEnabled: params.accountingIntegrationEnabled,
    automaticAccountingEnabled: params.automaticAccountingEnabled,
  });

  return {
    success: true,
    accountingEvent: accountingPersistence.accountingEvent,
    paymentId: accountingPersistence.paymentId ?? payment.id,
  };
}

async function persistIssuedCheckForPayment(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  payment: PaymentInsertRow;
  supplierId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  issuedCheckData: NonNullable<RegisterPaymentInput["issuedCheckData"]>;
}): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await createChequeEmitidoServer({
      orgId: params.orgId,
      cuentaBancariaId: params.issuedCheckData.cuentaBancariaId,
      numeroCheque: params.issuedCheckData.numeroCheque,
      importe: truncateMoney(params.amount).toFixed(4),
      fechaEmision: params.issuedCheckData.fechaEmision,
      fechaDebito: params.issuedCheckData.fechaDebito,
      beneficiario: params.issuedCheckData.beneficiario,
      beneficiarioId: params.supplierId,
      tipo: params.paymentMethod === "e-cheq" ? "ECH" : "CDF",
      notas: params.issuedCheckData.notas,
      referenciaPagoId: params.payment.id,
      referenciaPagoTabla: "payable_payments",
    });
    return { success: true };
  } catch (error) {
    const { data: rolledBackPayment, error: rollbackError } =
      await params.supabase
        .from("payable_payments" as never)
        .delete()
        .eq("id", params.payment.id)
        .eq("organization_id", params.orgId)
        .select("id")
        .maybeSingle();

    if (rollbackError || !rolledBackPayment) {
      return {
        success: false,
        error:
          "El cheque no se registró y el pago requiere revisión manual. No vuelvas a intentarlo.",
      };
    }

    return {
      success: false,
      error:
        error instanceof Error
          ? `No se pudo registrar el cheque propio: ${error.message}`
          : "No se pudo registrar el cheque propio",
    };
  }
}

async function createPayablePaymentWithAccounting(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  payableAccount: {
    id: string;
    supplier_id: string;
    purchase_order_id?: string | null;
  };
  amount: number;
  currencyFields: PaymentCurrencyFields;
  paymentMethod: PaymentMethod;
  paymentMethodValue: Database["public"]["Enums"]["payment_method_type"];
  paymentDate: string;
  referenceNumber: string | null;
  notes: string | null;
  issuedCheckData?: NonNullable<RegisterPaymentInput["issuedCheckData"]>;
  accountingIntegrationEnabled: boolean;
  automaticAccountingEnabled: boolean;
}): Promise<
  | {
      success: true;
      accountingEvent?: AnyEvento;
      paymentId: string;
    }
  | {
      success: false;
      error: string;
    }
> {
  const { data: insertedPayment, error: insertError } = await params.supabase
    .from("payable_payments" as never)
    .insert({
      organization_id: params.orgId,
      account_payable_id: params.payableAccount.id,
      amount: truncateMoney(params.amount),
      currency: params.currencyFields.currency,
      exchange_rate: params.currencyFields.exchangeRate,
      amount_ars: params.currencyFields.amountArs,
      payment_method: params.paymentMethodValue,
      payment_date: params.paymentDate,
      reference_number: params.referenceNumber,
      notes: params.notes,
    } as never)
    .select(
      "id, organization_id, account_payable_id, amount, payment_method, payment_date, reference_number"
    )
    .single();

  if (insertError) {
    return {
      success: false,
      error: `No se pudo registrar el pago: ${insertError.message}`,
    };
  }

  const payment = insertedPayment as PaymentInsertRow;

  if (params.issuedCheckData) {
    const issuedCheckResult = await persistIssuedCheckForPayment({
      supabase: params.supabase,
      orgId: params.orgId,
      payment,
      supplierId: params.payableAccount.supplier_id,
      amount: params.amount,
      paymentMethod: params.paymentMethod,
      issuedCheckData: params.issuedCheckData,
    });
    if (!issuedCheckResult.success) {
      return issuedCheckResult;
    }
  }

  if (!params.accountingIntegrationEnabled) {
    return {
      success: true,
      paymentId: payment.id,
    };
  }

  const builtAccountingEvent = buildOrdenPago(
    {
      ...payment,
      amount: params.currencyFields.amountArs,
      payment_method: toBuilderPaymentMethod(payment.payment_method),
    },
    {
      supplier_id: params.payableAccount.supplier_id,
      purchase_order_id: params.payableAccount.purchase_order_id ?? null,
    },
    params.currencyFields.currency === "USD"
      ? {
          moneda: "USD",
          tipoCambio: params.currencyFields.exchangeRate,
          montoUSD: truncateMoney(params.amount),
        }
      : undefined
  );

  const accountingPersistence = await persistPaymentAccounting({
    supabase: params.supabase,
    orgId: params.orgId,
    paymentTable: "payable_payments",
    paymentId: payment.id,
    accountingEvent: builtAccountingEvent,
    sourceType: "ORDEN_PAGO",
    accountingIntegrationEnabled: params.accountingIntegrationEnabled,
    automaticAccountingEnabled: params.automaticAccountingEnabled,
  });

  return {
    success: true,
    accountingEvent: accountingPersistence.accountingEvent,
    paymentId: accountingPersistence.paymentId ?? payment.id,
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: receivable payment applies credits, reconciles balance and validates currency fields.
async function applyReceivablePayment({
  supabase,
  orgId,
  input,
  amount,
  creditAmount,
  paymentDate,
  referenceNumber,
  notes,
  paymentMethodValue,
  supplierDifferentiatedCredits,
  accountingIntegrationEnabled,
  automaticAccountingEnabled,
  commissionsEnabled,
}: {
  supabase: SupabaseServerClient;
  orgId: string;
  input: RegisterPaymentInput;
  amount: number;
  creditAmount: number;
  paymentDate: string;
  referenceNumber: string | null;
  notes: string | null;
  paymentMethodValue: Database["public"]["Enums"]["payment_method_type"];
  supplierDifferentiatedCredits: boolean;
  accountingIntegrationEnabled: boolean;
  automaticAccountingEnabled: boolean;
  commissionsEnabled: boolean;
}): Promise<RegisterPaymentResult> {
  const { data: receivable, error: receivableError } = await supabase
    .from("accounts_receivable")
    .select(
      "id, organization_id, total_amount, pending_balance, status, customer_id, sales_order_id, currency"
    )
    .eq("id", input.accountId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (receivableError) {
    return {
      success: false,
      error: `No se pudo obtener la cuenta por cobrar: ${receivableError.message}`,
    };
  }

  if (!receivable) {
    return {
      success: false,
      error: "Cuenta por cobrar no encontrada",
      code: "account_not_found",
    };
  }

  const pendingBalance = truncateMoney(Number(receivable.pending_balance ?? 0));
  const totalAmount = truncateMoney(Number(receivable.total_amount ?? 0));
  const totals = computePaymentTotals({
    pendingBalance,
    totalAmount,
    amount,
    creditAmount,
  });

  if (!totals.success) {
    return {
      success: false,
      error: totals.error,
      code: totals.code,
    };
  }

  const { creditToApply, newPendingBalance, newStatus, creditGenerated } =
    totals;

  let accountingEvent: AnyEvento | undefined;
  let paymentId: string | undefined;

  let creditSupplierId: string | null = null;
  if (supplierDifferentiatedCredits) {
    creditSupplierId = await deriveReceivableCreditSupplier(
      input.orgSlug,
      receivable.id
    );
  }

  const creditError = await applyCustomerCredits({
    supabase,
    orgId,
    customerId: receivable.customer_id,
    creditToApply,
    accountReceivableId: receivable.id,
    paymentDate,
    referenceNumber,
    notes,
    supplierId: creditSupplierId,
    supplierDifferentiatedCredits,
    customerCreditId: input.customerCreditId,
    currency: receivable.currency ?? "ARS",
  });

  if (creditError) {
    return {
      success: false,
      error: creditError,
    };
  }

  if (amount > 0) {
    const exchangeRateError = assertPaymentExchangeRate(
      receivable.currency,
      amount,
      input.exchangeRate
    );
    if (exchangeRateError) {
      return {
        success: false,
        error: exchangeRateError,
        code: "exchange_rate_required",
      };
    }

    const currencyFields = resolvePaymentCurrencyFields(
      receivable.currency,
      amount,
      input.exchangeRate
    );
    const paymentPersistence = await createReceivablePaymentWithAccounting({
      supabase,
      orgId,
      receivable,
      amount,
      currencyFields,
      paymentMethodValue,
      paymentDate,
      referenceNumber,
      notes,
      accountingIntegrationEnabled,
      automaticAccountingEnabled,
      commissionsEnabled,
    });

    if (!paymentPersistence.success) {
      return {
        success: false,
        error: paymentPersistence.error,
      };
    }

    accountingEvent = paymentPersistence.accountingEvent;
    paymentId = paymentPersistence.paymentId;
  }

  const { error: updateError } = await supabase
    .from("accounts_receivable")
    .update({
      pending_balance: truncateMoney(newPendingBalance),
      status: toReceivableStatus(newStatus),
      updated_at: new Date().toISOString(),
    })
    .eq("id", receivable.id)
    .eq("organization_id", orgId);

  if (updateError) {
    return {
      success: false,
      error: `No se pudo actualizar el saldo: ${updateError.message}`,
    };
  }

  await createCustomerOverpaymentCredit({
    supabase,
    orgId,
    customerId: receivable.customer_id,
    supplierId: creditSupplierId,
    creditGenerated,
    notes,
    currency: receivable.currency ?? "ARS",
  });

  await syncSalesAdvanceAfterReceivablePayment({
    supabase,
    orgId,
    saleId: receivable.sales_order_id,
    nextStatus: newStatus,
    paymentId,
  });

  if (!accountingEvent) {
    revalidatePath(`/org/${input.orgSlug}/cobranzas`);
  }

  return {
    success: true,
    newPendingBalance,
    newStatus,
    creditGenerated: creditGenerated > 0 ? creditGenerated : undefined,
    accountingEvent,
    paymentId,
  };
}

async function applyEndorsedPayablePayment(params: {
  orgId: string;
  input: RegisterPaymentInput;
  payableAccount: PayableAccountRow;
  creditAmount: number;
  paymentDate: string;
  referenceNumber: string | null;
  notes: string | null;
  accountingIntegrationEnabled: boolean;
  automaticAccountingEnabled: boolean;
}): Promise<RegisterPaymentResult> {
  const endorsementResult =
    await createEndorsedCheckPayablePaymentWithAccounting(params);

  if (!endorsementResult.success) {
    return {
      success: false,
      error: endorsementResult.error,
      code: endorsementResult.code,
    };
  }

  if (!endorsementResult.accountingEvent) {
    revalidatePath(`/org/${params.input.orgSlug}/cobranzas`);
    revalidatePath(`/org/${params.input.orgSlug}/tesoreria`);
  }

  return {
    success: true,
    newPendingBalance: endorsementResult.newPendingBalance,
    newStatus: endorsementResult.newStatus,
    accountingEvent: endorsementResult.accountingEvent,
    paymentId: endorsementResult.paymentId,
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: payable payment applies supplier credits, reconciles balance and validates currency fields.
async function applyStandardPayablePayment(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  input: RegisterPaymentInput;
  payableAccount: PayableAccountRow;
  amount: number;
  creditAmount: number;
  paymentDate: string;
  referenceNumber: string | null;
  notes: string | null;
  paymentMethodValue: Database["public"]["Enums"]["payment_method_type"];
  accountingIntegrationEnabled: boolean;
  automaticAccountingEnabled: boolean;
}): Promise<RegisterPaymentResult> {
  const pendingBalance = truncateMoney(
    Number(params.payableAccount.pending_balance ?? 0)
  );
  const totalAmount = truncateMoney(
    Number(params.payableAccount.total_amount ?? 0)
  );
  const totals = computePaymentTotals({
    pendingBalance,
    totalAmount,
    amount: params.amount,
    creditAmount: params.creditAmount,
  });

  if (!totals.success) {
    return {
      success: false,
      error: totals.error,
      code: totals.code,
    };
  }

  const { creditToApply, newPendingBalance, newStatus, creditGenerated } =
    totals;
  const creditError = await applySupplierCredits({
    supabase: params.supabase,
    orgId: params.orgId,
    supplierId: params.payableAccount.supplier_id,
    creditToApply,
    currency: params.payableAccount.currency ?? "ARS",
  });

  if (creditError) {
    return {
      success: false,
      error: creditError,
    };
  }

  let accountingEvent: AnyEvento | undefined;
  let paymentId: string | undefined;

  if (params.amount > 0) {
    const exchangeRateError = assertPaymentExchangeRate(
      params.payableAccount.currency,
      params.amount,
      params.input.exchangeRate
    );
    if (exchangeRateError) {
      return {
        success: false,
        error: exchangeRateError,
        code: "exchange_rate_required",
      };
    }

    const currencyFields = resolvePaymentCurrencyFields(
      params.payableAccount.currency,
      params.amount,
      params.input.exchangeRate
    );
    const paymentPersistence = await createPayablePaymentWithAccounting({
      supabase: params.supabase,
      orgId: params.orgId,
      payableAccount: params.payableAccount,
      amount: params.amount,
      currencyFields,
      paymentMethod: params.input.paymentMethod,
      paymentMethodValue: params.paymentMethodValue,
      paymentDate: params.paymentDate,
      referenceNumber: params.referenceNumber,
      notes: params.notes,
      issuedCheckData:
        params.input.paymentMethod === "cheque" ||
        params.input.paymentMethod === "e-cheq"
          ? params.input.issuedCheckData
          : undefined,
      accountingIntegrationEnabled: params.accountingIntegrationEnabled,
      automaticAccountingEnabled: params.automaticAccountingEnabled,
    });

    if (!paymentPersistence.success) {
      return {
        success: false,
        error: paymentPersistence.error,
      };
    }

    accountingEvent = paymentPersistence.accountingEvent;
    paymentId = paymentPersistence.paymentId;
  }

  const { error: updateError } = await params.supabase
    .from("accounts_payable" as never)
    .update({
      pending_balance: truncateMoney(newPendingBalance),
      status: newStatus,
    } as never)
    .eq("id", params.payableAccount.id)
    .eq("organization_id", params.orgId);

  if (updateError) {
    return {
      success: false,
      error: `No se pudo actualizar el saldo: ${updateError.message}`,
    };
  }

  if (!accountingEvent) {
    revalidatePath(`/org/${params.input.orgSlug}/cobranzas`);
  }

  await createSupplierOverpaymentCredit({
    supabase: params.supabase,
    orgId: params.orgId,
    supplierId: params.payableAccount.supplier_id,
    creditGenerated,
    notes: params.notes,
    currency: params.payableAccount.currency ?? "ARS",
  });

  return {
    success: true,
    newPendingBalance,
    newStatus,
    creditGenerated: creditGenerated > 0 ? creditGenerated : undefined,
    accountingEvent,
    paymentId,
  };
}

async function applyPayablePayment({
  supabase,
  orgId,
  input,
  amount,
  creditAmount,
  paymentDate,
  referenceNumber,
  notes,
  paymentMethodValue,
  accountingIntegrationEnabled,
  automaticAccountingEnabled,
}: {
  supabase: SupabaseServerClient;
  orgId: string;
  input: RegisterPaymentInput;
  amount: number;
  creditAmount: number;
  paymentDate: string;
  referenceNumber: string | null;
  notes: string | null;
  paymentMethodValue: Database["public"]["Enums"]["payment_method_type"];
  accountingIntegrationEnabled: boolean;
  automaticAccountingEnabled: boolean;
}): Promise<RegisterPaymentResult> {
  const { data: payable, error: payableError } = await supabase
    .from("accounts_payable" as never)
    .select(
      "id, organization_id, total_amount, pending_balance, status, supplier_id, purchase_order_id, currency"
    )
    .eq("id", input.accountId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (payableError) {
    return {
      success: false,
      error: `No se pudo obtener la cuenta por pagar: ${payableError.message}`,
    };
  }

  if (!payable) {
    return {
      success: false,
      error: "Cuenta por pagar no encontrada",
      code: "account_not_found",
    };
  }

  const payableAccount = payable as PayableAccountRow;

  if (input.paymentMethod === "cheque_endosado") {
    if ((payableAccount.currency ?? "ARS") === "USD") {
      return {
        success: false,
        error:
          "El pago con cheque endosado no está disponible para deudas en USD.",
        code: "invalid_payment_method",
      };
    }
    return applyEndorsedPayablePayment({
      orgId,
      input,
      payableAccount,
      creditAmount,
      paymentDate,
      referenceNumber,
      notes,
      accountingIntegrationEnabled,
      automaticAccountingEnabled,
    });
  }

  return applyStandardPayablePayment({
    supabase,
    orgId,
    input,
    payableAccount,
    amount,
    creditAmount,
    paymentDate,
    referenceNumber,
    notes,
    paymentMethodValue,
    accountingIntegrationEnabled,
    automaticAccountingEnabled,
  });
}

export async function markPaymentAccountingJournalAction(input: {
  orgSlug: string;
  type: RegisterPaymentInput["type"];
  paymentId: string;
  journalEntryId: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await requireAuth();
    const org = await getOrganizationBySlug(input.orgSlug);

    if (!org?.id) {
      return {
        success: false,
        error: "Organización no encontrada",
      };
    }

    const supabase = await createClient();
    const table =
      input.type === "receivable" ? "receivable_payments" : "payable_payments";

    const { error } = await supabase
      .from(table as never)
      .update({ accounting_journal_entry_id: input.journalEntryId } as never)
      .eq("id", input.paymentId)
      .eq("organization_id", org.id);

    if (error) {
      return {
        success: false,
        error: `No se pudo vincular el asiento formal: ${error.message}`,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error al marcar el asiento contable",
    };
  }
}

function validatePaymentAmounts(
  amount: number,
  creditAmount: number
): { success: false; error: string; code: "invalid_amount" } | null {
  if (!Number.isFinite(amount) || amount < 0) {
    return {
      success: false,
      error: "El monto debe ser mayor a cero",
      code: "invalid_amount",
    };
  }
  if (!Number.isFinite(creditAmount) || creditAmount < 0) {
    return {
      success: false,
      error: "El crédito debe ser mayor o igual a cero",
      code: "invalid_amount",
    };
  }
  if (amount <= 0 && creditAmount <= 0) {
    return {
      success: false,
      error: "El monto debe ser mayor a cero",
      code: "invalid_amount",
    };
  }
  return null;
}

function validateIssuedCheck(input: RegisterPaymentInput): string | null {
  const isIssuedCheckPayment =
    input.type === "payable" &&
    (input.paymentMethod === "cheque" || input.paymentMethod === "e-cheq");

  if (!isIssuedCheckPayment) {
    return null;
  }

  const check = input.issuedCheckData;
  if (!check) {
    return "Completa todos los datos del cheque propio";
  }

  const hasAllIssuedCheckFields = Boolean(
    check.cuentaBancariaId.trim() &&
      check.numeroCheque.trim() &&
      check.fechaEmision &&
      check.fechaDebito &&
      check.beneficiario.trim()
  );

  if (!hasAllIssuedCheckFields) {
    return "Completa todos los datos del cheque propio";
  }

  if (check.fechaDebito < check.fechaEmision) {
    return "La fecha de débito no puede ser anterior a la fecha de emisión";
  }

  return null;
}

function validateEndorsedChecks(input: RegisterPaymentInput): string | null {
  if (
    !(input.type === "payable" && input.paymentMethod === "cheque_endosado")
  ) {
    return null;
  }

  if (!input.receivedCheckIds?.length) {
    return "Selecciona al menos un cheque recibido para endosar";
  }

  if (new Set(input.receivedCheckIds).size !== input.receivedCheckIds.length) {
    return "Los cheques seleccionados no pueden repetirse";
  }

  return null;
}

function mapEndorsementErrorCode(error: string): RegisterPaymentErrorCode {
  const normalized = error.toLowerCase();

  if (normalized.includes("crédito insuficiente")) {
    return "insufficient_credit";
  }

  if (
    normalized.includes("ya no está disponible") ||
    normalized.includes("ya fueron endosados") ||
    normalized.includes("boleta de depósito")
  ) {
    return "check_not_available";
  }

  if (normalized.includes("no puede exceder el saldo pendiente")) {
    return "total_exceeds_pending";
  }

  if (
    normalized.includes("no corresponde al proveedor") ||
    normalized.includes("saldo pendiente")
  ) {
    return "concurrency_conflict";
  }

  return;
}

function buildEndorsedChecksAccountingReference(
  checks: Array<{ numeroCheque: string }>,
  referenceNumber: string | null
): string {
  const checkNumbers = checks.map((check) => check.numeroCheque).join(", ");
  const endorsedChecksReference = `Cheques endosados N° ${checkNumbers}`;
  const trimmedReference = referenceNumber?.trim();

  return trimmedReference
    ? `${trimmedReference} - ${endorsedChecksReference}`
    : endorsedChecksReference;
}

async function createEndorsedCheckPayablePaymentWithAccounting(params: {
  orgId: string;
  input: RegisterPaymentInput;
  payableAccount: {
    id: string;
    supplier_id: string;
    purchase_order_id?: string | null;
  };
  creditAmount: number;
  paymentDate: string;
  referenceNumber: string | null;
  notes: string | null;
  accountingIntegrationEnabled: boolean;
  automaticAccountingEnabled: boolean;
}): Promise<
  | {
      success: true;
      accountingEvent?: AnyEvento;
      paymentId: string;
      newPendingBalance: number;
      newStatus: CollectionAccountStatus;
    }
  | {
      success: false;
      error: string;
      code?: RegisterPaymentErrorCode;
    }
> {
  try {
    const endorsement = await endorseReceivedChecksForPayableServer({
      orgId: params.orgId,
      operationId: params.input.operationId,
      accountPayableId: params.payableAccount.id,
      supplierId: params.payableAccount.supplier_id,
      receivedCheckIds: params.input.receivedCheckIds ?? [],
      creditAmount: truncateMoney(params.creditAmount).toFixed(4),
      paymentDate: params.paymentDate,
      referenceNumber: params.referenceNumber ?? undefined,
      notes: params.notes ?? undefined,
    });

    if (!params.accountingIntegrationEnabled) {
      return {
        success: true,
        paymentId: endorsement.paymentId,
        newPendingBalance: truncateMoney(Number(endorsement.newPendingBalance)),
        newStatus: endorsement.newStatus,
      };
    }

    const builtAccountingEvent = buildOrdenPago(
      {
        id: endorsement.paymentId,
        organization_id: params.orgId,
        account_payable_id: params.payableAccount.id,
        amount: Number(endorsement.paymentAmount),
        payment_method: "cheque",
        payment_date: params.paymentDate,
        reference_number: buildEndorsedChecksAccountingReference(
          endorsement.endorsedChecks,
          params.referenceNumber
        ),
      },
      {
        supplier_id: params.payableAccount.supplier_id,
        purchase_order_id: params.payableAccount.purchase_order_id ?? null,
      },
      {
        bancoAccountCode: "VALORES_A_DEPOSITAR",
      }
    );

    const accountingPersistence = await persistPaymentAccounting({
      supabase: await createClient(),
      orgId: params.orgId,
      paymentTable: "payable_payments",
      paymentId: endorsement.paymentId,
      accountingEvent: builtAccountingEvent,
      sourceType: "ORDEN_PAGO",
      accountingIntegrationEnabled: params.accountingIntegrationEnabled,
      automaticAccountingEnabled: params.automaticAccountingEnabled,
    });

    return {
      success: true,
      accountingEvent: accountingPersistence.accountingEvent,
      paymentId: accountingPersistence.paymentId ?? endorsement.paymentId,
      newPendingBalance: truncateMoney(Number(endorsement.newPendingBalance)),
      newStatus: endorsement.newStatus,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo endosar los cheques";

    return {
      success: false,
      error: message,
      code: mapEndorsementErrorCode(message),
    };
  }
}

export async function registerPaymentAction(
  input: RegisterPaymentInput
): Promise<RegisterPaymentResult> {
  await guardOrganizationPermissionAccess(input.orgSlug, "collections.manage");

  if (input.type === "payable" && input.paymentMethod === "cheque_endosado") {
    await guardOrganizationPermissionAccess(
      input.orgSlug,
      "treasury.checks.manage"
    );
  }

  const org = await getOrganizationBySlug(input.orgSlug);

  if (!org?.id) {
    return {
      success: false,
      error: "Organización no encontrada",
      code: "organization_not_found",
    };
  }

  const amount = truncateMoney(Number(input.amount));
  const creditAmount = truncateMoney(Number(input.creditAmount ?? 0));

  const amountError = validatePaymentAmounts(amount, creditAmount);
  if (amountError) {
    return amountError;
  }

  const issuedCheckError = validateIssuedCheck(input);
  if (issuedCheckError) {
    return {
      success: false,
      error: issuedCheckError,
      code: "invalid_check_data",
    };
  }

  const endorsedChecksError = validateEndorsedChecks(input);
  if (endorsedChecksError) {
    return {
      success: false,
      error: endorsedChecksError,
      code: "invalid_check_data",
    };
  }

  const supabase = await createClient();
  const paymentDate = toDateOnly(input.paymentDate);
  const referenceNumber = sanitize(input.referenceNumber);
  const notes = sanitize(input.notes);
  const paymentMethodValue = resolvePaymentMethod(input.paymentMethod);
  const accountingIntegrationEnabled = await isAccountingIntegrationEnabled(
    input.orgSlug
  );
  const orgSettings = await getOrgSettings(input.orgSlug);
  const automaticAccountingEnabled = orgSettings.automatic_accounting_enabled;

  try {
    if (input.type === "receivable") {
      return await applyReceivablePayment({
        supabase,
        orgId: org.id,
        input,
        amount,
        creditAmount,
        paymentDate,
        referenceNumber,
        notes,
        paymentMethodValue,
        supplierDifferentiatedCredits: org.supplier_differentiated_credits,
        accountingIntegrationEnabled,
        automaticAccountingEnabled,
        commissionsEnabled: org.commissions_enabled ?? false,
      });
    }

    return await applyPayablePayment({
      supabase,
      orgId: org.id,
      input,
      amount,
      creditAmount,
      paymentDate,
      referenceNumber,
      notes,
      paymentMethodValue,
      accountingIntegrationEnabled,
      automaticAccountingEnabled,
    });
  } catch (error) {
    // Error registrando pago
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error inesperado al registrar el pago",
    };
  }
}

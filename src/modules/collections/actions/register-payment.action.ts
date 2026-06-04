"use server";

import { revalidatePath } from "next/cache";
import { truncateMoney } from "@/lib/decimal";
import { createClient } from "@/lib/supabase/server";
import { deriveReceivableCreditSupplier } from "@/modules/collections/service/collections.service";
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
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

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
  };
};

const sumRemainingAmounts = (credits: Array<{ remaining_amount: number }>) =>
  credits.reduce(
    (sum, credit) =>
      truncateMoney(sum + truncateMoney(Number(credit.remaining_amount ?? 0))),
    0
  );

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
}) => {
  if (creditToApply <= 0) {
    return null;
  }

  let query = supabase
    .from("customer_credits")
    .select("id, remaining_amount")
    .eq("organization_id", orgId)
    .eq("customer_id", customerId)
    .gt("remaining_amount", 0)
    .order("created_at", { ascending: true });

  if (supplierDifferentiatedCredits) {
    if (supplierId) {
      query = query.eq("supplier_id", supplierId);
    } else {
      return "No se pudo determinar el proveedor asociado a esta venta. No se pueden aplicar créditos.";
    }
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
  }

  const { error: insertError } = await supabase
    .from("customer_credit_applications")
    .insert({
      organization_id: orgId,
      customer_id: customerId,
      account_receivable_id: accountReceivableId,
      amount: truncateMoney(creditToApply),
      payment_date: paymentDate,
      reference_number: referenceNumber,
      notes,
    });

  if (insertError) {
    return `Error al registrar aplicacion de credito: ${insertError.message}`;
  }

  return null;
};

const applySupplierCredits = async ({
  supabase,
  orgId,
  supplierId,
  creditToApply,
}: {
  supabase: SupabaseServerClient;
  orgId: string;
  supplierId: string;
  creditToApply: number;
}) => {
  if (creditToApply <= 0) {
    return null;
  }

  const { data: credits, error: creditsError } = await supabase
    .from("supplier_credits" as never)
    .select("id, remaining_amount")
    .eq("organization_id", orgId)
    .eq("supplier_id", supplierId)
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
}): Promise<RegisterPaymentResult> {
  const { data: receivable, error: receivableError } = await supabase
    .from("accounts_receivable")
    .select(
      "id, organization_id, total_amount, pending_balance, status, customer_id"
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
  });

  if (creditError) {
    return {
      success: false,
      error: creditError,
    };
  }

  if (amount > 0) {
    const insertReceivablePayment = async (
      method: Database["public"]["Enums"]["payment_method_type"]
    ) =>
      supabase.from("receivable_payments").insert({
        organization_id: orgId,
        account_receivable_id: receivable.id,
        amount: truncateMoney(amount),
        payment_method: method,
        payment_date: paymentDate,
        reference_number: referenceNumber,
        notes,
      });

    const { error: insertError } =
      await insertReceivablePayment(paymentMethodValue);

    if (insertError) {
      return {
        success: false,
        error: `No se pudo registrar el pago: ${insertError.message}`,
      };
    }
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

  if (creditGenerated > 0) {
    await supabase.from("customer_credits").insert({
      organization_id: orgId,
      customer_id: receivable.customer_id,
      supplier_id: creditSupplierId,
      amount: creditGenerated,
      remaining_amount: creditGenerated,
      source_payment_id: null,
      notes: notes
        ? `Saldo a favor por sobrepago — ${notes}`
        : "Saldo a favor por sobrepago",
    });
  }

  revalidatePath(`/org/${input.orgSlug}/cobranzas`);

  return {
    success: true,
    newPendingBalance,
    newStatus,
    creditGenerated: creditGenerated > 0 ? creditGenerated : undefined,
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
}): Promise<RegisterPaymentResult> {
  const { data: payable, error: payableError } = await supabase
    .from("accounts_payable" as never)
    .select(
      "id, organization_id, total_amount, pending_balance, status, supplier_id"
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
  const pendingBalance = truncateMoney(
    Number(payableAccount.pending_balance ?? 0)
  );
  const totalAmount = truncateMoney(Number(payableAccount.total_amount ?? 0));
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

  const creditError = await applySupplierCredits({
    supabase,
    orgId,
    supplierId: payableAccount.supplier_id,
    creditToApply,
  });

  if (creditError) {
    return {
      success: false,
      error: creditError,
    };
  }

  if (amount > 0) {
    const insertPayablePayment = async (
      method: Database["public"]["Enums"]["payment_method_type"]
    ) =>
      supabase.from("payable_payments" as never).insert({
        organization_id: orgId,
        account_payable_id: payableAccount.id,
        amount: truncateMoney(amount),
        payment_method: method,
        payment_date: paymentDate,
        reference_number: referenceNumber,
        notes,
      } as never);

    const { error: insertError } =
      await insertPayablePayment(paymentMethodValue);

    if (insertError) {
      return {
        success: false,
        error: `No se pudo registrar el pago: ${insertError.message}`,
      };
    }
  }

  const { error: updateError } = await supabase
    .from("accounts_payable" as never)
    .update({
      pending_balance: truncateMoney(newPendingBalance),
      status: newStatus,
    } as never)
    .eq("id", payableAccount.id)
    .eq("organization_id", orgId);

  if (updateError) {
    return {
      success: false,
      error: `No se pudo actualizar el saldo: ${updateError.message}`,
    };
  }

  revalidatePath(`/org/${input.orgSlug}/cobranzas`);

  if (creditGenerated > 0) {
    await supabase.from("supplier_credits" as never).insert({
      organization_id: orgId,
      supplier_id: payableAccount.supplier_id,
      amount: creditGenerated,
      remaining_amount: creditGenerated,
      source_payment_id: null,
      notes: notes
        ? `Saldo a favor por sobrepago — ${notes}`
        : "Saldo a favor por sobrepago",
    } as never);
  }

  return {
    success: true,
    newPendingBalance,
    newStatus,
    creditGenerated: creditGenerated > 0 ? creditGenerated : undefined,
  };
}

export async function registerPaymentAction(
  input: RegisterPaymentInput
): Promise<RegisterPaymentResult> {
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

  const supabase = await createClient();
  const paymentDate = toDateOnly(input.paymentDate);
  const referenceNumber = sanitize(input.referenceNumber);
  const notes = sanitize(input.notes);
  const paymentMethodValue = resolvePaymentMethod(input.paymentMethod);

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

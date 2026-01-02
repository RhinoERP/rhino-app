"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { Database } from "@/types/supabase";
import type { CollectionAccountStatus, PaymentMethod } from "../types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type PayablePaymentRow = {
  id: string;
  amount: number | null;
  account_payable_id: string;
  organization_id: string;
};
type PayableAccountRow = {
  id: string;
  total_amount: number | null;
  pending_balance: number | null;
};

export type UpdatePaymentInput = {
  orgSlug: string;
  paymentId: string;
  accountId: string;
  type: "receivable" | "payable";
  amount: number;
  paymentMethod: PaymentMethod;
  paymentDate?: string;
  referenceNumber?: string;
  notes?: string;
};

export type UpdatePaymentResult =
  | {
      success: true;
      newPendingBalance: number;
      newStatus: CollectionAccountStatus;
    }
  | {
      success: false;
      error: string;
      code?:
        | "organization_not_found"
        | "payment_not_found"
        | "invalid_amount"
        | "amount_exceeds_pending";
    };

const paymentMethodMap: Record<
  PaymentMethod,
  Database["public"]["Enums"]["payment_method_type"]
> = {
  efectivo: "efectivo",
  transferencia: "transferencia",
  cheque: "cheque",
  tarjeta_de_credito: "tarjeta de credito",
  tarjeta_de_debito: "tarjeta de debito",
};

const resolvePaymentMethod = (
  method: PaymentMethod
): Database["public"]["Enums"]["payment_method_type"] =>
  paymentMethodMap[method] ?? "efectivo";

const toDateOnly = (value?: string | null) => {
  if (!value) {
    return new Date().toISOString().split("T")[0];
  }
  return value;
};

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

const sanitize = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

async function fetchReceivablePayment(
  supabase: SupabaseServerClient,
  orgId: string,
  paymentId: string
) {
  return await supabase
    .from("receivable_payments")
    .select("id, amount, account_receivable_id, organization_id")
    .eq("id", paymentId)
    .eq("organization_id", orgId)
    .maybeSingle();
}

async function fetchPayablePayment(
  supabase: SupabaseServerClient,
  orgId: string,
  paymentId: string
) {
  return await supabase
    .from("payable_payments" as never)
    .select("id, amount, account_payable_id, organization_id")
    .eq("id", paymentId)
    .eq("organization_id", orgId)
    .maybeSingle();
}

type UpdatePaymentContext = {
  supabase: SupabaseServerClient;
  orgId: string;
  amount: number;
  paymentDate: string;
  referenceNumber: string | null;
  notes: string | null;
  paymentMethodValue: Database["public"]["Enums"]["payment_method_type"];
  paymentMethod: PaymentMethod;
};

async function handleReceivablePayment(
  ctx: UpdatePaymentContext,
  paymentId: string
): Promise<UpdatePaymentResult> {
  const {
    supabase,
    orgId,
    amount,
    paymentDate,
    referenceNumber,
    notes,
    paymentMethodValue,
    paymentMethod,
  } = ctx;

  const { data: payment, error: paymentError } = await fetchReceivablePayment(
    supabase,
    orgId,
    paymentId
  );

  if (paymentError) {
    return {
      success: false,
      error: `No se pudo obtener el pago: ${paymentError.message}`,
    };
  }

  if (!payment) {
    return {
      success: false,
      error: "Pago no encontrado",
      code: "payment_not_found",
    };
  }

  const oldAmount = Number(payment.amount ?? 0);

  const { data: account, error: accountError } = await supabase
    .from("accounts_receivable")
    .select("id, total_amount, pending_balance")
    .eq("id", payment.account_receivable_id)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (accountError || !account) {
    return {
      success: false,
      error:
        accountError?.message ??
        "Cuenta por cobrar no encontrada para este pago",
    };
  }

  const pendingBefore = Number(account.pending_balance ?? 0);
  const maxAllowed = pendingBefore + oldAmount;
  if (amount > maxAllowed) {
    return {
      success: false,
      error: "El monto excede el saldo pendiente",
      code: "amount_exceeds_pending",
    };
  }

  const newPendingBalance = Math.max(0, pendingBefore + oldAmount - amount);
  const newStatus = deriveStatus(
    Number(account.total_amount ?? 0),
    newPendingBalance
  );

  const updatePayment = async (
    method: Database["public"]["Enums"]["payment_method_type"]
  ) =>
    supabase
      .from("receivable_payments")
      .update({
        amount,
        payment_method: method,
        payment_date: paymentDate,
        reference_number: referenceNumber,
        notes,
      })
      .eq("id", payment.id)
      .eq("organization_id", orgId);

  let updatePaymentError = (await updatePayment(paymentMethodValue)).error;

  if (updatePaymentError) {
    const normalizedMethod = resolvePaymentMethod(paymentMethod);
    if (normalizedMethod !== paymentMethodValue) {
      updatePaymentError = (await updatePayment(normalizedMethod)).error;
    }
  }

  if (updatePaymentError) {
    return {
      success: false,
      error: `No se pudo actualizar el pago: ${updatePaymentError.message}`,
    };
  }

  const { error: updateAccountError } = await supabase
    .from("accounts_receivable")
    .update({
      pending_balance: newPendingBalance,
      status: toReceivableStatus(newStatus),
      updated_at: new Date().toISOString(),
    })
    .eq("id", account.id)
    .eq("organization_id", orgId);

  if (updateAccountError) {
    return {
      success: false,
      error: `No se pudo actualizar la cuenta: ${updateAccountError.message}`,
    };
  }

  return {
    success: true,
    newPendingBalance,
    newStatus,
  };
}

async function handlePayablePayment(
  ctx: UpdatePaymentContext,
  paymentId: string
): Promise<UpdatePaymentResult> {
  const {
    supabase,
    orgId,
    amount,
    paymentDate,
    referenceNumber,
    notes,
    paymentMethodValue,
    paymentMethod,
  } = ctx;

  const { data: paymentData, error: paymentError } = await fetchPayablePayment(
    supabase,
    orgId,
    paymentId
  );

  const payment = paymentData as PayablePaymentRow | null;

  if (paymentError) {
    return {
      success: false,
      error: `No se pudo obtener el pago: ${paymentError.message}`,
    };
  }

  if (!payment) {
    return {
      success: false,
      error: "Pago no encontrado",
      code: "payment_not_found",
    };
  }

  const oldAmount = Number(payment.amount ?? 0);

  const { data: accountData, error: accountError } = await supabase
    .from("accounts_payable" as never)
    .select("id, total_amount, pending_balance")
    .eq("id", payment.account_payable_id)
    .eq("organization_id", orgId)
    .maybeSingle();
  const account = accountData as PayableAccountRow | null;

  if (accountError || !account) {
    return {
      success: false,
      error:
        accountError?.message ??
        "Cuenta por pagar no encontrada para este pago",
    };
  }

  const pendingBefore = Number(account.pending_balance ?? 0);
  const maxAllowed = pendingBefore + oldAmount;
  if (amount > maxAllowed) {
    return {
      success: false,
      error: "El monto excede el saldo pendiente",
      code: "amount_exceeds_pending",
    };
  }

  const newPendingBalance = Math.max(0, pendingBefore + oldAmount - amount);
  const newStatus = deriveStatus(
    Number(account.total_amount ?? 0),
    newPendingBalance
  );

  const updatePayment = async (
    method: Database["public"]["Enums"]["payment_method_type"]
  ) =>
    supabase
      .from("payable_payments" as never)
      .update({
        amount,
        payment_method: method,
        payment_date: paymentDate,
        reference_number: referenceNumber,
        notes,
      } as never)
      .eq("id", payment.id)
      .eq("organization_id", orgId);

  let updatePaymentError = (await updatePayment(paymentMethodValue)).error;

  if (updatePaymentError) {
    const normalizedMethod = resolvePaymentMethod(paymentMethod);
    if (normalizedMethod !== paymentMethodValue) {
      updatePaymentError = (await updatePayment(normalizedMethod)).error;
    }
  }

  if (updatePaymentError) {
    return {
      success: false,
      error: `No se pudo actualizar el pago: ${updatePaymentError.message}`,
    };
  }

  const { error: updateAccountError } = await supabase
    .from("accounts_payable" as never)
    .update({
      pending_balance: newPendingBalance,
      status: newStatus,
    } as never)
    .eq("id", account.id)
    .eq("organization_id", orgId);

  if (updateAccountError) {
    return {
      success: false,
      error: `No se pudo actualizar la cuenta: ${updateAccountError.message}`,
    };
  }

  return {
    success: true,
    newPendingBalance,
    newStatus,
  };
}

export async function updatePaymentAction(
  input: UpdatePaymentInput
): Promise<UpdatePaymentResult> {
  const org = await getOrganizationBySlug(input.orgSlug);

  if (!org?.id) {
    return {
      success: false,
      error: "Organización no encontrada",
      code: "organization_not_found",
    };
  }

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
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
    const context: UpdatePaymentContext = {
      supabase,
      orgId: org.id,
      amount,
      paymentDate,
      referenceNumber,
      notes,
      paymentMethodValue,
      paymentMethod: input.paymentMethod,
    };

    const result =
      input.type === "receivable"
        ? await handleReceivablePayment(context, input.paymentId)
        : await handlePayablePayment(context, input.paymentId);

    if (result.success) {
      revalidatePath(`/org/${input.orgSlug}/cobranzas`);
    }

    return result;
  } catch (error) {
    console.error("Error actualizando pago", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error inesperado al actualizar el pago",
    };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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

async function applyReceivablePayment({
  supabase,
  orgId,
  input,
  amount,
  paymentDate,
  referenceNumber,
  notes,
  paymentMethodValue,
}: {
  supabase: SupabaseServerClient;
  orgId: string;
  input: RegisterPaymentInput;
  amount: number;
  paymentDate: string;
  referenceNumber: string | null;
  notes: string | null;
  paymentMethodValue: Database["public"]["Enums"]["payment_method_type"];
}): Promise<RegisterPaymentResult> {
  const { data: receivable, error: receivableError } = await supabase
    .from("accounts_receivable")
    .select("id, organization_id, total_amount, pending_balance, status")
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

  const pendingBalance = Number(receivable.pending_balance ?? 0);

  if (amount > pendingBalance) {
    return {
      success: false,
      error: "El monto excede el saldo pendiente",
      code: "amount_exceeds_pending",
    };
  }

  const totalAmount = Number(receivable.total_amount ?? 0);
  const newPendingBalance = Math.max(0, pendingBalance - amount);
  const newStatus = deriveStatus(totalAmount, newPendingBalance);

  const insertReceivablePayment = async (
    method: Database["public"]["Enums"]["payment_method_type"]
  ) =>
    supabase.from("receivable_payments").insert({
      organization_id: orgId,
      account_receivable_id: receivable.id,
      amount,
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

  const { error: updateError } = await supabase
    .from("accounts_receivable")
    .update({
      pending_balance: newPendingBalance,
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

  revalidatePath(`/org/${input.orgSlug}/cobranzas`);

  return {
    success: true,
    newPendingBalance,
    newStatus,
  };
}

async function applyPayablePayment({
  supabase,
  orgId,
  input,
  amount,
  paymentDate,
  referenceNumber,
  notes,
  paymentMethodValue,
}: {
  supabase: SupabaseServerClient;
  orgId: string;
  input: RegisterPaymentInput;
  amount: number;
  paymentDate: string;
  referenceNumber: string | null;
  notes: string | null;
  paymentMethodValue: Database["public"]["Enums"]["payment_method_type"];
}): Promise<RegisterPaymentResult> {
  const { data: payable, error: payableError } = await supabase
    .from("accounts_payable" as never)
    .select("id, organization_id, total_amount, pending_balance, status")
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
  const pendingBalance = Number(payableAccount.pending_balance ?? 0);

  if (amount > pendingBalance) {
    return {
      success: false,
      error: "El monto excede el saldo pendiente",
      code: "amount_exceeds_pending",
    };
  }

  const totalAmount = Number(payableAccount.total_amount ?? 0);
  const newPendingBalance = Math.max(0, pendingBalance - amount);
  const newStatus = deriveStatus(totalAmount, newPendingBalance);

  const insertPayablePayment = async (
    method: Database["public"]["Enums"]["payment_method_type"]
  ) =>
    supabase.from("payable_payments" as never).insert({
      organization_id: orgId,
      account_payable_id: payableAccount.id,
      amount,
      payment_method: method,
      payment_date: paymentDate,
      reference_number: referenceNumber,
      notes,
    } as never);

  const { error: insertError } = await insertPayablePayment(paymentMethodValue);

  if (insertError) {
    return {
      success: false,
      error: `No se pudo registrar el pago: ${insertError.message}`,
    };
  }

  const { error: updateError } = await supabase
    .from("accounts_payable" as never)
    .update({
      pending_balance: newPendingBalance,
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

  return {
    success: true,
    newPendingBalance,
    newStatus,
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
    if (input.type === "receivable") {
      return await applyReceivablePayment({
        supabase,
        orgId: org.id,
        input,
        amount,
        paymentDate,
        referenceNumber,
        notes,
        paymentMethodValue,
      });
    }

    return await applyPayablePayment({
      supabase,
      orgId: org.id,
      input,
      amount,
      paymentDate,
      referenceNumber,
      notes,
      paymentMethodValue,
    });
  } catch (error) {
    console.error("Error registrando pago", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error inesperado al registrar el pago",
    };
  }
}

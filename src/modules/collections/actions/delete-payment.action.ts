"use server";

import { revalidatePath } from "next/cache";
import { truncateMoney } from "@/lib/decimal";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import type { Database } from "@/types/supabase";
import type { CollectionAccountStatus } from "../types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type PayableAccountRow = {
  id: string;
  organization_id: string;
  total_amount: number;
  pending_balance: number;
  status?: string | null;
};
type PayablePaymentRow = {
  id: string;
  amount: number | null;
  account_payable_id: string;
  organization_id: string;
  payment_method: string;
};

export type DeletePaymentInput = {
  orgSlug: string;
  paymentId: string;
  accountId: string;
  type: "receivable" | "payable";
};

export type DeletePaymentResult =
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
        | "account_not_found";
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

async function deleteReceivablePayment({
  supabase,
  orgId,
  paymentId,
  accountId,
}: {
  supabase: SupabaseServerClient;
  orgId: string;
  paymentId: string;
  accountId: string;
}): Promise<DeletePaymentResult> {
  // Get the payment to retrieve its amount
  const { data: payment, error: paymentError } = await supabase
    .from("receivable_payments")
    .select("id, amount, account_receivable_id")
    .eq("id", paymentId)
    .eq("organization_id", orgId)
    .eq("account_receivable_id", accountId)
    .maybeSingle();

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

  const paymentAmount = truncateMoney(Number(payment.amount ?? 0));

  // Get the receivable account
  const { data: receivable, error: receivableError } = await supabase
    .from("accounts_receivable")
    .select("id, organization_id, total_amount, pending_balance, status")
    .eq("id", accountId)
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

  // Calculate new pending balance (add back the payment amount)
  const currentPendingBalance = truncateMoney(
    Number(receivable.pending_balance ?? 0)
  );
  const totalAmount = truncateMoney(Number(receivable.total_amount ?? 0));
  const newPendingBalance = truncateMoney(
    Math.min(totalAmount, currentPendingBalance + paymentAmount)
  );
  const newStatus = deriveStatus(totalAmount, newPendingBalance);

  // Delete the payment
  const { error: deleteError } = await supabase
    .from("receivable_payments")
    .delete()
    .eq("id", paymentId)
    .eq("organization_id", orgId);

  if (deleteError) {
    return {
      success: false,
      error: `No se pudo eliminar el pago: ${deleteError.message}`,
    };
  }

  // Update the receivable account balance and status
  const { error: updateError } = await supabase
    .from("accounts_receivable")
    .update({
      pending_balance: truncateMoney(newPendingBalance),
      status: toReceivableStatus(newStatus),
      updated_at: new Date().toISOString(),
    })
    .eq("id", accountId)
    .eq("organization_id", orgId);

  if (updateError) {
    return {
      success: false,
      error: `No se pudo actualizar el saldo: ${updateError.message}`,
    };
  }

  return {
    success: true,
    newPendingBalance,
    newStatus,
  };
}

async function deletePayablePayment({
  supabase,
  orgId,
  paymentId,
  accountId,
}: {
  supabase: SupabaseServerClient;
  orgId: string;
  paymentId: string;
  accountId: string;
}): Promise<DeletePaymentResult> {
  // Get the payment to retrieve its amount
  const { data: paymentData, error: paymentError } = await supabase
    .from("payable_payments" as never)
    .select("id, amount, account_payable_id, payment_method")
    .eq("id", paymentId)
    .eq("organization_id", orgId)
    .eq("account_payable_id", accountId)
    .maybeSingle();
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

  if (
    payment.payment_method === "cheque" ||
    payment.payment_method === "e-cheq"
  ) {
    return {
      success: false,
      error:
        "Los pagos con cheque propio no se pueden eliminar. Gestiona el cheque desde Tesorería.",
    };
  }

  const paymentAmount = truncateMoney(Number(payment.amount ?? 0));

  // Get the payable account
  const { data: payable, error: payableError } = await supabase
    .from("accounts_payable" as never)
    .select("id, organization_id, total_amount, pending_balance, status")
    .eq("id", accountId)
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

  // Calculate new pending balance (add back the payment amount)
  const currentPendingBalance = truncateMoney(
    Number(payableAccount.pending_balance ?? 0)
  );
  const totalAmount = truncateMoney(Number(payableAccount.total_amount ?? 0));
  const newPendingBalance = truncateMoney(
    Math.min(totalAmount, currentPendingBalance + paymentAmount)
  );
  const newStatus = deriveStatus(totalAmount, newPendingBalance);

  // Delete the payment
  const { error: deleteError } = await supabase
    .from("payable_payments" as never)
    .delete()
    .eq("id", paymentId)
    .eq("organization_id", orgId);

  if (deleteError) {
    return {
      success: false,
      error: `No se pudo eliminar el pago: ${deleteError.message}`,
    };
  }

  // Update the payable account balance and status
  const { error: updateError } = await supabase
    .from("accounts_payable" as never)
    .update({
      pending_balance: truncateMoney(newPendingBalance),
      status: newStatus,
    } as never)
    .eq("id", accountId)
    .eq("organization_id", orgId);

  if (updateError) {
    return {
      success: false,
      error: `No se pudo actualizar el saldo: ${updateError.message}`,
    };
  }

  return {
    success: true,
    newPendingBalance,
    newStatus,
  };
}

export async function deletePaymentAction(
  input: DeletePaymentInput
): Promise<DeletePaymentResult> {
  await ensure("collections.manage", input.orgSlug);
  const org = await getOrganizationBySlug(input.orgSlug);

  if (!org?.id) {
    return {
      success: false,
      error: "Organización no encontrada",
      code: "organization_not_found",
    };
  }

  const supabase = await createClient();

  try {
    if (input.type === "receivable") {
      const result = await deleteReceivablePayment({
        supabase,
        orgId: org.id,
        paymentId: input.paymentId,
        accountId: input.accountId,
      });

      if (result.success) {
        revalidatePath(`/org/${input.orgSlug}/cobranzas`);
      }

      return result;
    }

    const result = await deletePayablePayment({
      supabase,
      orgId: org.id,
      paymentId: input.paymentId,
      accountId: input.accountId,
    });

    if (result.success) {
      revalidatePath(`/org/${input.orgSlug}/cobranzas`);
    }

    return result;
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error inesperado al eliminar el pago",
    };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { truncateMoney } from "@/lib/decimal";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { Database } from "@/types/supabase";
import type {
  CancelPaymentInput,
  CancelPaymentResult,
  CollectionAccountStatus,
} from "../types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

function deriveStatus(
  totalAmount: number,
  pendingBalance: number
): CollectionAccountStatus {
  if (pendingBalance <= 0) {
    return "PAID";
  }
  if (pendingBalance < totalAmount) {
    return "PARTIAL";
  }
  return "PENDING";
}

function toReceivableStatus(
  status: CollectionAccountStatus
): Database["public"]["Enums"]["receivable_status"] {
  switch (status) {
    case "PAID":
      return "PAID";
    case "PARTIAL":
      return "PARTIALLY_PAID";
    default:
      return "PENDING";
  }
}

async function revertCustomerCreditApps({
  supabase,
  orgId,
  paymentId,
}: {
  supabase: SupabaseServerClient;
  orgId: string;
  paymentId: string;
}): Promise<boolean> {
  const { data: creditApps } = await supabase
    .from("customer_credit_applications")
    .select("id, customer_credit_id, amount")
    .eq("organization_id", orgId)
    .eq("receivable_payment_id", paymentId);

  if (!creditApps || creditApps.length === 0) {
    return false;
  }

  for (const app of creditApps) {
    const { data: credit } = await supabase
      .from("customer_credits")
      .select("remaining_amount")
      .eq("id", app.customer_credit_id as string as string)
      .eq("organization_id", orgId)
      .maybeSingle();

    const currentRemaining = truncateMoney(
      Number(credit?.remaining_amount ?? 0)
    );

    await supabase
      .from("customer_credits")
      .update({
        remaining_amount: truncateMoney(currentRemaining + Number(app.amount)),
      })
      .eq("id", app.customer_credit_id as string)
      .eq("organization_id", orgId);
  }

  const appIds = creditApps.map((a) => a.id);
  await supabase.from("customer_credit_applications").delete().in("id", appIds);

  return true;
}

async function revertCustomerOverpaymentCredits({
  supabase,
  orgId,
  paymentId,
}: {
  supabase: SupabaseServerClient;
  orgId: string;
  paymentId: string;
}) {
  const { data: overpaymentCredits } = await supabase
    .from("customer_credits")
    .select("id, notes")
    .eq("organization_id", orgId)
    .eq("source_payment_id", paymentId)
    .gt("remaining_amount", 0);

  if (!overpaymentCredits || overpaymentCredits.length === 0) {
    return;
  }

  for (const credit of overpaymentCredits) {
    await supabase
      .from("customer_credits")
      .update({
        remaining_amount: 0,
        notes:
          `${credit.notes ?? ""} (REVERSED por cancelación de pago)`.trim(),
      })
      .eq("id", credit.id)
      .eq("organization_id", orgId);
  }
}

async function revertSupplierCreditApps({
  supabase,
  orgId,
  paymentId,
}: {
  supabase: SupabaseServerClient;
  orgId: string;
  paymentId: string;
}): Promise<boolean> {
  const { data: creditApps } = await supabase
    .from("supplier_credit_applications")
    .select("id, supplier_credit_id, amount")
    .eq("organization_id", orgId)
    .eq("payable_payment_id", paymentId);

  if (!creditApps || creditApps.length === 0) {
    return false;
  }

  for (const app of creditApps) {
    const { data: credit } = await supabase
      .from("supplier_credits")
      .select("remaining_amount")
      .eq("id", app.supplier_credit_id as string)
      .eq("organization_id", orgId)
      .maybeSingle();

    const currentRemaining = truncateMoney(
      Number(credit?.remaining_amount ?? 0)
    );

    await supabase
      .from("supplier_credits")
      .update({
        remaining_amount: truncateMoney(currentRemaining + Number(app.amount)),
      })
      .eq("id", app.supplier_credit_id as string)
      .eq("organization_id", orgId);
  }

  const appIds = creditApps.map((a) => a.id);
  await supabase.from("supplier_credit_applications").delete().in("id", appIds);

  return true;
}

async function revertSupplierOverpaymentCredits({
  supabase,
  orgId,
  paymentId,
}: {
  supabase: SupabaseServerClient;
  orgId: string;
  paymentId: string;
}) {
  const { data: overpaymentCredits } = await supabase
    .from("supplier_credits")
    .select("id, notes")
    .eq("organization_id", orgId)
    .eq("source_payment_id", paymentId)
    .gt("remaining_amount", 0);

  if (!overpaymentCredits || overpaymentCredits.length === 0) {
    return;
  }

  for (const credit of overpaymentCredits) {
    await supabase
      .from("supplier_credits")
      .update({
        remaining_amount: 0,
        notes:
          `${credit.notes ?? ""} (REVERSED por cancelación de pago)`.trim(),
      })
      .eq("id", credit.id)
      .eq("organization_id", orgId);
  }
}

async function cancelReceivablePayment({
  supabase,
  orgId,
  userId,
  paymentId,
  accountId,
  reason,
}: {
  supabase: SupabaseServerClient;
  orgId: string;
  userId: string;
  paymentId: string;
  accountId: string;
  reason?: string;
}): Promise<CancelPaymentResult> {
  const { data: payment, error: paymentError } = await supabase
    .from("receivable_payments")
    .select("id, amount, account_receivable_id, status")
    .eq("id", paymentId)
    .eq("organization_id", orgId)
    .single();

  if (paymentError || !payment) {
    return {
      success: false,
      error: "Pago no encontrado",
      code: "payment_not_found",
    };
  }

  if (payment.status === "CANCELLED") {
    return {
      success: false,
      error: "El pago ya fue cancelado",
      code: "payment_already_cancelled",
    };
  }

  const paymentAmount = truncateMoney(Number(payment.amount ?? 0));

  const creditsReverted = await revertCustomerCreditApps({
    supabase,
    orgId,
    paymentId,
  });

  await revertCustomerOverpaymentCredits({ supabase, orgId, paymentId });

  const { data: receivable, error: receivableError } = await supabase
    .from("accounts_receivable")
    .select("id, total_amount, pending_balance")
    .eq("id", accountId)
    .eq("organization_id", orgId)
    .single();

  if (receivableError || !receivable) {
    return {
      success: false,
      error: "Cuenta por cobrar no encontrada",
      code: "account_not_found",
    };
  }

  const currentPending = truncateMoney(Number(receivable.pending_balance));
  const totalAmount = truncateMoney(Number(receivable.total_amount));
  const newPendingBalance = truncateMoney(
    Math.min(totalAmount, currentPending + paymentAmount)
  );
  const newStatus = deriveStatus(totalAmount, newPendingBalance);

  await supabase
    .from("accounts_receivable")
    .update({
      pending_balance: newPendingBalance,
      status: toReceivableStatus(newStatus),
      updated_at: new Date().toISOString(),
    })
    .eq("id", accountId)
    .eq("organization_id", orgId);

  const finalReason = creditsReverted
    ? (reason ?? null)
    : `[CRÉDITOS NO REVERTIDOS] ${reason ?? ""}`.trim();

  await supabase
    .from("receivable_payments")
    .update({
      status: "CANCELLED",
      cancelled_at: new Date().toISOString(),
      cancelled_by: userId,
      cancelled_reason: finalReason ?? undefined,
    })
    .eq("id", paymentId)
    .eq("organization_id", orgId);

  return {
    success: true,
    newPendingBalance,
    newStatus,
    creditsNotReverted: !creditsReverted,
  };
}

async function cancelPayablePayment({
  supabase,
  orgId,
  userId,
  paymentId,
  accountId,
  reason,
}: {
  supabase: SupabaseServerClient;
  orgId: string;
  userId: string;
  paymentId: string;
  accountId: string;
  reason?: string;
}): Promise<CancelPaymentResult> {
  const { data: payment, error: paymentError } = await supabase
    .from("payable_payments")
    .select("id, amount, account_payable_id, status")
    .eq("id", paymentId)
    .eq("organization_id", orgId)
    .single();

  if (paymentError || !payment) {
    return {
      success: false,
      error: "Pago no encontrado",
      code: "payment_not_found",
    };
  }

  if (payment.status === "CANCELLED") {
    return {
      success: false,
      error: "El pago ya fue cancelado",
      code: "payment_already_cancelled",
    };
  }

  const paymentAmount = truncateMoney(Number(payment.amount ?? 0));

  const creditsReverted = await revertSupplierCreditApps({
    supabase,
    orgId,
    paymentId,
  });

  await revertSupplierOverpaymentCredits({ supabase, orgId, paymentId });

  const { data: payable, error: payableError } = await supabase
    .from("accounts_payable")
    .select("id, total_amount, pending_balance")
    .eq("id", accountId)
    .eq("organization_id", orgId)
    .single();

  if (payableError || !payable) {
    return {
      success: false,
      error: "Cuenta por pagar no encontrada",
      code: "account_not_found",
    };
  }

  const currentPending = truncateMoney(Number(payable.pending_balance));
  const totalAmount = truncateMoney(Number(payable.total_amount));
  const newPendingBalance = truncateMoney(
    Math.min(totalAmount, currentPending + paymentAmount)
  );
  const newStatus = deriveStatus(totalAmount, newPendingBalance);

  await supabase
    .from("accounts_payable")
    .update({
      pending_balance: newPendingBalance,
      status: newStatus,
    })
    .eq("id", accountId)
    .eq("organization_id", orgId);

  const finalReason = creditsReverted
    ? (reason ?? null)
    : `[CRÉDITOS NO REVERTIDOS] ${reason ?? ""}`.trim();

  await supabase
    .from("payable_payments")
    .update({
      status: "CANCELLED",
      cancelled_at: new Date().toISOString(),
      cancelled_by: userId,
      cancelled_reason: finalReason ?? undefined,
    })
    .eq("id", paymentId)
    .eq("organization_id", orgId);

  return {
    success: true,
    newPendingBalance,
    newStatus,
    creditsNotReverted: !creditsReverted,
  };
}

export async function cancelPaymentAction(
  input: CancelPaymentInput
): Promise<CancelPaymentResult> {
  const org = await getOrganizationBySlug(input.orgSlug);

  if (!org?.id) {
    return {
      success: false,
      error: "Organización no encontrada",
      code: "organization_not_found",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "No autorizado" };
  }

  try {
    const result =
      input.type === "receivable"
        ? await cancelReceivablePayment({
            supabase,
            orgId: org.id,
            userId: user.id,
            paymentId: input.paymentId,
            accountId: input.accountId,
            reason: input.reason,
          })
        : await cancelPayablePayment({
            supabase,
            orgId: org.id,
            userId: user.id,
            paymentId: input.paymentId,
            accountId: input.accountId,
            reason: input.reason,
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
          : "Error inesperado al cancelar el pago",
    };
  }
}

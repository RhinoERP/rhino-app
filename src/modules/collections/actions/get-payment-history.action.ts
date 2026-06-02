"use server";

import { truncateMoney } from "@/lib/decimal";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { Database } from "@/types/supabase";

export type PaymentHistoryEntry = {
  id: string;
  amount: number;
  credit_amount: number;
  payment_method: Database["public"]["Enums"]["payment_method_type"];
  payment_date: string;
  reference_number: string | null;
  notes: string | null;
  created_at: string | null;
  status: string;
  cancelled_at: string | null;
  cancelled_reason: string | null;
};

type PaymentHistoryInput = {
  orgSlug: string;
  accountId: string;
  type: "receivable" | "payable";
  orgId?: string;
};

const paymentMethodMap: Record<
  string,
  Database["public"]["Enums"]["payment_method_type"] | string
> = {
  efectivo: "efectivo",
  transferencia: "transferencia",
  cheque: "cheque",
  "tarjeta de credito": "tarjeta de credito",
  "tarjeta de debito": "tarjeta de debito",
  deposito: "deposito",
  "e-cheq": "e-cheq",
};

function normalizePaymentMethod(
  method: string | null
): Database["public"]["Enums"]["payment_method_type"] {
  if (!method) {
    return "efectivo";
  }

  const normalized = paymentMethodMap[method.toLowerCase()];

  return (normalized ??
    "efectivo") as Database["public"]["Enums"]["payment_method_type"];
}

function extractCancellationMeta(row: Record<string, unknown>) {
  return {
    status: typeof row.status === "string" ? row.status : "ACTIVE",
    cancelled_at:
      typeof row.cancelled_at === "string" ? row.cancelled_at : null,
    cancelled_reason:
      typeof row.cancelled_reason === "string" ? row.cancelled_reason : null,
  };
}

function normalizePaymentRows(
  rows: Record<string, unknown>[] | null
): PaymentHistoryEntry[] {
  if (!rows?.length) {
    return [];
  }

  return rows.map((row) => {
    const cancellationMeta = extractCancellationMeta(row);
    return {
      id: String(row.id),
      amount: truncateMoney(Number(row.amount) || 0),
      credit_amount: truncateMoney(Number(row.credit_amount) || 0),
      payment_method: normalizePaymentMethod(
        typeof row.payment_method === "string" ? row.payment_method : null
      ),
      payment_date:
        typeof row.payment_date === "string" ? row.payment_date : "",
      reference_number:
        typeof row.reference_number === "string" ? row.reference_number : null,
      notes: typeof row.notes === "string" ? row.notes : null,
      created_at: typeof row.created_at === "string" ? row.created_at : null,
      ...cancellationMeta,
    };
  });
}

function mergeCreditAmounts(
  entries: PaymentHistoryEntry[],
  creditMap: Map<string, number>
) {
  for (const entry of entries) {
    entry.credit_amount = truncateMoney(creditMap.get(entry.id) ?? 0);
  }
}

async function fetchAndMergeCredits({
  supabase,
  orgId,
  entries,
  creditTable,
  paymentIdColumn,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  orgId: string;
  entries: PaymentHistoryEntry[];
  creditTable: "customer_credit_applications" | "supplier_credit_applications";
  paymentIdColumn: string;
}) {
  const paymentIds = entries.map((e) => e.id);
  if (paymentIds.length === 0) {
    return;
  }

  const { data: creditApps } = await supabase
    .from(creditTable as never)
    .select(`${paymentIdColumn}, amount`)
    .eq("organization_id", orgId)
    .in(paymentIdColumn, paymentIds);

  const creditMap = new Map<string, number>();
  for (const app of (creditApps ?? []) as Record<string, unknown>[]) {
    const key = app[paymentIdColumn] as string;
    creditMap.set(
      key,
      truncateMoney((creditMap.get(key) ?? 0) + Number(app.amount))
    );
  }

  mergeCreditAmounts(entries, creditMap);
}

export async function getPaymentHistoryAction(
  input: PaymentHistoryInput
): Promise<{
  success: boolean;
  data?: PaymentHistoryEntry[];
  error?: string;
}> {
  try {
    let orgId = input.orgId;
    if (!orgId) {
      const org = await getOrganizationBySlug(input.orgSlug);
      if (!org?.id) {
        return { success: false, error: "Organización no encontrada" };
      }
      orgId = org.id;
    }

    const supabase = await createClient();

    if (input.type === "receivable") {
      const { data: receivablePayments, error: receivableError } =
        await supabase
          .from("receivable_payments")
          .select(
            "id, amount, payment_method, payment_date, reference_number, notes, created_at, status, cancelled_at, cancelled_reason"
          )
          .eq("organization_id", orgId)
          .eq("account_receivable_id", input.accountId)
          .order("payment_date", { ascending: false });

      if (receivableError) {
        return {
          success: false,
          error: `No se pudo obtener el historial: ${receivableError.message}`,
        };
      }

      const entries = normalizePaymentRows(receivablePayments);

      await fetchAndMergeCredits({
        supabase,
        orgId,
        entries,
        creditTable: "customer_credit_applications",
        paymentIdColumn: "receivable_payment_id",
      });

      return { success: true, data: entries };
    }

    const { data: payablePayments, error: payableError } = await supabase
      .from("payable_payments")
      .select(
        "id, amount, payment_method, payment_date, reference_number, notes, created_at, status, cancelled_at, cancelled_reason"
      )
      .eq("organization_id", orgId)
      .eq("account_payable_id", input.accountId)
      .order("payment_date", { ascending: false });

    if (payableError) {
      return {
        success: false,
        error: `No se pudo obtener el historial: ${payableError.message}`,
      };
    }

    const entries = normalizePaymentRows(payablePayments);

    await fetchAndMergeCredits({
      supabase,
      orgId,
      entries,
      creditTable: "supplier_credit_applications",
      paymentIdColumn: "payable_payment_id",
    });

    return { success: true, data: entries };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error inesperado obteniendo historial",
    };
  }
}

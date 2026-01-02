"use server";

import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { Database } from "@/types/supabase";

export type PaymentHistoryEntry = {
  id: string;
  amount: number;
  payment_method: Database["public"]["Enums"]["payment_method"];
  payment_date: string;
  reference_number: string | null;
  notes: string | null;
  created_at: string | null;
};

type PaymentHistoryInput = {
  orgSlug: string;
  accountId: string;
  type: "receivable" | "payable";
  orgId?: string;
};

const paymentMethodMap: Record<
  string,
  Database["public"]["Enums"]["payment_method"]
> = {
  efectivo: "EFECTIVO",
  transferencia: "TRANSFERENCIA",
  cheque: "CHEQUE",
  "tarjeta de credito": "TARJETA_CREDITO",
  "tarjeta de debito": "TARJETA_DEBITO",
};

function normalizePaymentMethod(
  method: string | null
): Database["public"]["Enums"]["payment_method"] {
  if (!method) {
    return "OTRO";
  }

  const normalized = paymentMethodMap[method.toLowerCase()];

  return normalized ?? "OTRO";
}

function normalizePaymentRows(
  rows: Record<string, unknown>[] | null
): PaymentHistoryEntry[] {
  if (!rows?.length) {
    return [];
  }

  return rows.map((row) => ({
    id: String(row.id),
    amount: Number(row.amount) || 0,
    payment_method: normalizePaymentMethod(
      typeof row.payment_method === "string" ? row.payment_method : null
    ),
    payment_date: typeof row.payment_date === "string" ? row.payment_date : "",
    reference_number:
      typeof row.reference_number === "string" ? row.reference_number : null,
    notes: typeof row.notes === "string" ? row.notes : null,
    created_at: typeof row.created_at === "string" ? row.created_at : null,
  }));
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
            "id, amount, payment_method, payment_date, reference_number, notes, created_at"
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

      return {
        success: true,
        data: normalizePaymentRows(receivablePayments),
      };
    }

    const { data: payablePayments, error: payableError } = await supabase
      .from("payable_payments" as never)
      .select(
        "id, amount, payment_method, payment_date, reference_number, notes, created_at"
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

    return {
      success: true,
      data: normalizePaymentRows(payablePayments),
    };
  } catch (error) {
    console.error("Error obteniendo historial de pagos", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error inesperado obteniendo historial",
    };
  }
}

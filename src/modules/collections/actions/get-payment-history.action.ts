"use server";

import { truncateMoney } from "@/lib/decimal";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import type { Database } from "@/types/supabase";

export type PaymentHistoryEntry = {
  id: string;
  amount: number;
  payment_method: Database["public"]["Enums"]["payment_method_type"];
  payment_date: string;
  reference_number: string | null;
  notes: string | null;
  created_at: string | null;
  receipt_number: string | null;
  receipt_pdf_url: string | null;
  invoice_pdf_url: string | null;
  invoice_filename: string | null;
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

const readNullableString = (
  row: Record<string, unknown>,
  key: string
): string | null => (typeof row[key] === "string" ? row[key] : null);

function normalizePaymentRows(
  rows: Record<string, unknown>[] | null
): PaymentHistoryEntry[] {
  if (!rows?.length) {
    return [];
  }

  return rows.map((row) => ({
    id: String(row.id),
    amount: truncateMoney(Number(row.amount) || 0),
    payment_method: normalizePaymentMethod(
      typeof row.payment_method === "string" ? row.payment_method : null
    ),
    payment_date: typeof row.payment_date === "string" ? row.payment_date : "",
    reference_number: readNullableString(row, "reference_number"),
    notes: readNullableString(row, "notes"),
    created_at: readNullableString(row, "created_at"),
    receipt_number: readNullableString(row, "receipt_number"),
    receipt_pdf_url: readNullableString(row, "receipt_pdf_url"),
    invoice_pdf_url: readNullableString(row, "invoice_pdf_url"),
    invoice_filename: readNullableString(row, "invoice_filename"),
  }));
}

export async function getPaymentHistoryAction(
  input: PaymentHistoryInput
): Promise<{
  success: boolean;
  data?: PaymentHistoryEntry[];
  error?: string;
}> {
  await ensure(["collections.read", "collections.manage"], input.orgSlug);
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
            "id, amount, payment_method, payment_date, reference_number, notes, created_at, receipt_number, receipt_pdf_url"
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
        "id, amount, payment_method, payment_date, reference_number, notes, created_at, invoice_pdf_url, invoice_filename"
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
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error inesperado obteniendo historial",
    };
  }
}

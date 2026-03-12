"use server";

import { truncateMoney } from "@/lib/decimal";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { Database } from "@/types/supabase";

export type CustomerPaymentEntry = {
  id: string;
  account_receivable_id: string | null;
  amount: number;
  payment_method: string;
  payment_date: string;
  reference_number: string | null;
  notes: string | null;
  created_at: string | null;
  payment_group_id: string | null;
  sale_number: number | null;
  invoice_number: string | null;
  source: "payment" | "credit";
};

type CustomerPaymentsInput = {
  orgSlug: string;
  customerId: string;
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
  "cuenta corriente": "cuenta corriente",
};

function normalizePaymentMethod(method: string | null): string {
  if (!method) {
    return "efectivo";
  }

  const normalized = paymentMethodMap[method.toLowerCase()];

  return (normalized ?? "efectivo") as string;
}

const parseSaleNumber = (
  sale: Record<string, unknown> | null
): number | null => {
  if (!sale) {
    return null;
  }
  const raw = sale.sale_number;
  if (typeof raw === "number") {
    return raw;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseInvoiceNumber = (
  sale: Record<string, unknown> | null
): string | null => {
  if (!sale) {
    return null;
  }
  return typeof sale.invoice_number === "string" ? sale.invoice_number : null;
};

const getSaleFromRow = (row: Record<string, unknown>) => {
  const account = row.accounts_receivable as Record<string, unknown> | null;
  const saleField = account?.sale as
    | Record<string, unknown>
    | Record<string, unknown>[]
    | null
    | undefined;
  const sale = Array.isArray(saleField) ? saleField[0] : saleField;
  return sale ?? null;
};

const normalizePaymentRow = (
  row: Record<string, unknown>
): CustomerPaymentEntry => {
  const sale = getSaleFromRow(row);
  return {
    id: String(row.id),
    account_receivable_id:
      typeof row.account_receivable_id === "string"
        ? row.account_receivable_id
        : null,
    amount: truncateMoney(Number(row.amount) || 0),
    payment_method: normalizePaymentMethod(
      typeof row.payment_method === "string" ? row.payment_method : null
    ),
    payment_date: typeof row.payment_date === "string" ? row.payment_date : "",
    reference_number:
      typeof row.reference_number === "string" ? row.reference_number : null,
    notes: typeof row.notes === "string" ? row.notes : null,
    created_at: typeof row.created_at === "string" ? row.created_at : null,
    payment_group_id:
      typeof row.payment_group_id === "string" ? row.payment_group_id : null,
    sale_number: parseSaleNumber(sale),
    invoice_number: parseInvoiceNumber(sale),
    source: "payment",
  };
};

const normalizeCreditRow = (
  row: Record<string, unknown>
): CustomerPaymentEntry => {
  const sale = getSaleFromRow(row);
  return {
    id: String(row.id),
    account_receivable_id:
      typeof row.account_receivable_id === "string"
        ? row.account_receivable_id
        : null,
    amount: truncateMoney(Number(row.amount) || 0),
    payment_method: "cuenta corriente",
    payment_date: typeof row.payment_date === "string" ? row.payment_date : "",
    reference_number:
      typeof row.reference_number === "string" ? row.reference_number : null,
    notes: typeof row.notes === "string" ? row.notes : null,
    created_at: typeof row.created_at === "string" ? row.created_at : null,
    payment_group_id: null,
    sale_number: parseSaleNumber(sale),
    invoice_number: parseInvoiceNumber(sale),
    source: "credit",
  };
};

function normalizePaymentRows(
  rows: Record<string, unknown>[] | null
): CustomerPaymentEntry[] {
  if (!rows?.length) {
    return [];
  }

  return rows.map(normalizePaymentRow);
}

function normalizeCreditRows(
  rows: Record<string, unknown>[] | null
): CustomerPaymentEntry[] {
  if (!rows?.length) {
    return [];
  }

  return rows.map(normalizeCreditRow);
}

export async function getCustomerPaymentsAction(
  input: CustomerPaymentsInput
): Promise<{
  success: boolean;
  data?: CustomerPaymentEntry[];
  error?: string;
}> {
  try {
    const org = await getOrganizationBySlug(input.orgSlug);
    if (!org?.id) {
      return { success: false, error: "Organización no encontrada" };
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("receivable_payments")
      .select(
        `
        id,
        account_receivable_id,
        amount,
        payment_method,
        payment_date,
        reference_number,
        notes,
        created_at,
        payment_group_id,
        accounts_receivable!inner(
          customer_id,
          sale:sales_orders(invoice_number, sale_number)
        )
      `
      )
      .eq("organization_id", org.id)
      .eq("accounts_receivable.customer_id", input.customerId)
      .order("payment_date", { ascending: false });

    if (error) {
      return {
        success: false,
        error: `No se pudo obtener los pagos: ${error.message}`,
      };
    }

    const { data: creditData, error: creditError } = await supabase
      .from("customer_credit_applications")
      .select(
        `
        id,
        account_receivable_id,
        amount,
        payment_date,
        reference_number,
        notes,
        created_at,
        accounts_receivable(
          sale:sales_orders(invoice_number, sale_number)
        )
      `
      )
      .eq("organization_id", org.id)
      .eq("customer_id", input.customerId)
      .order("payment_date", { ascending: false });

    if (creditError) {
      return {
        success: false,
        error: `No se pudo obtener los creditos aplicados: ${creditError.message}`,
      };
    }

    const payments = normalizePaymentRows(data as Record<string, unknown>[]);
    const credits = normalizeCreditRows(
      creditData as Record<string, unknown>[] | null
    );

    return {
      success: true,
      data: [...payments, ...credits],
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error inesperado obteniendo pagos",
    };
  }
}

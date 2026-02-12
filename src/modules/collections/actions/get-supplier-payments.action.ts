"use server";

import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { Database } from "@/types/supabase";

export type SupplierPaymentEntry = {
  id: string;
  account_payable_id: string | null;
  amount: number;
  payment_method: string;
  payment_date: string;
  reference_number: string | null;
  notes: string | null;
  created_at: string | null;
  payment_group_id: string | null;
  purchase_number: number | null;
  purchase_order_id: string | null;
};

type SupplierPaymentsInput = {
  orgSlug: string;
  supplierId: string;
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

const parsePurchaseNumber = (
  order: Record<string, unknown> | null
): number | null => {
  if (!order) {
    return null;
  }
  const raw = order.purchase_number;
  if (typeof raw === "number") {
    return raw;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const getAccountFromRow = (row: Record<string, unknown>) =>
  row.accounts_payable as Record<string, unknown> | null;

const getOrderFromAccount = (account: Record<string, unknown> | null) => {
  const orderField = account?.purchase_order as
    | Record<string, unknown>
    | Record<string, unknown>[]
    | null
    | undefined;
  const order = Array.isArray(orderField) ? orderField[0] : orderField;
  return order ?? null;
};

const normalizePaymentRow = (
  row: Record<string, unknown>
): SupplierPaymentEntry => {
  const account = getAccountFromRow(row);
  const order = getOrderFromAccount(account);
  return {
    id: String(row.id),
    account_payable_id:
      typeof row.account_payable_id === "string"
        ? row.account_payable_id
        : null,
    amount: Number(row.amount) || 0,
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
    purchase_number: parsePurchaseNumber(order),
    purchase_order_id:
      typeof account?.purchase_order_id === "string"
        ? account.purchase_order_id
        : null,
  };
};

function normalizePaymentRows(
  rows: Record<string, unknown>[] | null
): SupplierPaymentEntry[] {
  if (!rows?.length) {
    return [];
  }

  return rows.map(normalizePaymentRow);
}

export async function getSupplierPaymentsAction(
  input: SupplierPaymentsInput
): Promise<{
  success: boolean;
  data?: SupplierPaymentEntry[];
  error?: string;
}> {
  try {
    const org = await getOrganizationBySlug(input.orgSlug);
    if (!org?.id) {
      return { success: false, error: "Organización no encontrada" };
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("payable_payments" as never)
      .select(
        `
        id,
        account_payable_id,
        amount,
        payment_method,
        payment_date,
        reference_number,
        notes,
        created_at,
        payment_group_id,
        accounts_payable!inner(
          supplier_id,
          purchase_order_id,
          purchase_order:purchase_orders(purchase_number)
        )
      `
      )
      .eq("organization_id", org.id)
      .eq("accounts_payable.supplier_id", input.supplierId)
      .order("payment_date", { ascending: false });

    if (error) {
      return {
        success: false,
        error: `No se pudo obtener los pagos: ${error.message}`,
      };
    }

    const payments = normalizePaymentRows(data as Record<string, unknown>[]);

    return {
      success: true,
      data: payments,
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

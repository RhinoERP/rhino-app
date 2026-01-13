import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { Database } from "@/types/supabase";
import type {
  CollectionAccountStatus,
  PayableAccount,
  ReceivableAccount,
} from "../types";

type ReceivableRow = Database["public"]["Tables"]["accounts_receivable"]["Row"];

type ReceivableWithRelations = ReceivableRow & {
  customer:
    | {
        id?: string | null;
        business_name?: string | null;
        fantasy_name?: string | null;
      }
    | Array<{
        id?: string | null;
        business_name?: string | null;
        fantasy_name?: string | null;
      }>
    | null;
  sale:
    | {
        invoice_number?: string | null;
        sale_date?: string | null;
        sale_number?: number | null;
      }
    | Array<{
        invoice_number?: string | null;
        sale_date?: string | null;
        sale_number?: number | null;
      }>
    | null;
};

type PayableRow = {
  id: string;
  organization_id: string;
  supplier_id: string;
  purchase_order_id: string;
  total_amount: number;
  pending_balance: number;
  due_date: string;
  status?: string | null;
  created_at?: string | null;
};

type PayableWithRelations = PayableRow & {
  supplier:
    | {
        id?: string | null;
        name?: string | null;
      }
    | Array<{
        id?: string | null;
        name?: string | null;
      }>
    | null;
  purchase:
    | {
        purchase_number?: number | null;
        purchase_date?: string | null;
      }
    | Array<{
        purchase_number?: number | null;
        purchase_date?: string | null;
      }>
    | null;
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

function normalizeCustomer(
  receivable: ReceivableWithRelations
): ReceivableAccount["customer"] {
  const rawCustomer = Array.isArray(receivable.customer)
    ? receivable.customer[0]
    : receivable.customer;

  if (rawCustomer && typeof rawCustomer === "object" && "id" in rawCustomer) {
    return {
      id: (rawCustomer.id as string) ?? receivable.customer_id,
      business_name:
        (rawCustomer.business_name as string | null) ?? "Cliente desconocido",
      fantasy_name: (rawCustomer.fantasy_name as string | null) ?? null,
    };
  }

  return {
    id: receivable.customer_id,
    business_name: "Cliente desconocido",
    fantasy_name: null,
  };
}

function normalizeSaleInfo(
  receivable: ReceivableWithRelations
): ReceivableAccount["sale"] {
  const rawSale = Array.isArray(receivable.sale)
    ? receivable.sale[0]
    : receivable.sale;

  if (
    rawSale &&
    typeof rawSale === "object" &&
    ("invoice_number" in rawSale ||
      "sale_date" in rawSale ||
      "sale_number" in rawSale)
  ) {
    return {
      invoice_number: (rawSale.invoice_number as string | null) ?? null,
      sale_date: (rawSale.sale_date as string | null) ?? null,
      sale_number:
        rawSale.sale_number !== undefined && rawSale.sale_number !== null
          ? Number(rawSale.sale_number)
          : null,
    };
  }

  return null;
}

function normalizeSupplier(
  payable: PayableWithRelations
): PayableAccount["supplier"] {
  const rawSupplier = Array.isArray(payable.supplier)
    ? payable.supplier[0]
    : payable.supplier;

  if (rawSupplier && typeof rawSupplier === "object" && "id" in rawSupplier) {
    return {
      id: (rawSupplier.id as string) ?? payable.supplier_id,
      name: (rawSupplier.name as string | null) ?? "Proveedor desconocido",
    };
  }

  return {
    id: payable.supplier_id,
    name: "Proveedor desconocido",
  };
}

function normalizePurchase(
  payable: PayableWithRelations
): PayableAccount["purchase"] {
  const rawPurchase = Array.isArray(payable.purchase)
    ? payable.purchase[0]
    : payable.purchase;

  if (
    rawPurchase &&
    typeof rawPurchase === "object" &&
    ("purchase_number" in rawPurchase || "purchase_date" in rawPurchase)
  ) {
    return {
      purchase_number: (rawPurchase.purchase_number as number | null) ?? null,
      purchase_date: (rawPurchase.purchase_date as string | null) ?? null,
    };
  }

  return null;
}

export async function getReceivablesByOrgSlug(
  orgSlug: string
): Promise<ReceivableAccount[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("accounts_receivable")
    .select(
      `
        *,
        customer:customers(id, business_name, fantasy_name),
        sale:sales_orders(invoice_number, sale_date, sale_number)
      `
    )
    .eq("organization_id", org.id)
    .order("due_date", { ascending: true });

  if (error) {
    throw new Error(
      `Error obteniendo cuentas por cobrar: ${error.message ?? "desconocido"}`
    );
  }

  if (!data) {
    return [];
  }

  return (data as unknown as ReceivableWithRelations[]).map((row) => {
    const total = Number(row.total_amount ?? 0);
    const pending = Math.max(0, Number(row.pending_balance ?? 0));
    const status = deriveStatus(total, pending);

    return {
      id: row.id,
      organization_id: row.organization_id,
      customer_id: row.customer_id,
      sales_order_id: row.sales_order_id,
      total_amount: total,
      pending_balance: pending,
      due_date: row.due_date,
      status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      customer: normalizeCustomer(row),
      sale: normalizeSaleInfo(row),
      type: "receivable",
    };
  });
}

export async function getPayablesByOrgSlug(
  orgSlug: string
): Promise<PayableAccount[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("accounts_payable" as never)
    .select(
      `
        id,
        organization_id,
        supplier_id,
        purchase_order_id,
        total_amount,
        pending_balance,
        due_date,
        status,
        created_at,
        supplier:suppliers(id, name),
        purchase:purchase_orders(purchase_number, purchase_date)
      `
    )
    .eq("organization_id", org.id)
    .order("due_date", { ascending: true });

  if (error) {
    throw new Error(
      `Error obteniendo cuentas por pagar: ${error.message ?? "desconocido"}`
    );
  }

  if (!data) {
    return [];
  }

  return (data as unknown as PayableWithRelations[]).map((row) => {
    const total = Number(row.total_amount ?? 0);
    const pending = Math.max(0, Number(row.pending_balance ?? 0));
    const status = deriveStatus(total, pending);

    return {
      id: row.id,
      organization_id: row.organization_id,
      supplier_id: row.supplier_id,
      purchase_order_id: row.purchase_order_id,
      total_amount: total,
      pending_balance: pending,
      due_date: row.due_date,
      status,
      created_at: row.created_at,
      supplier: normalizeSupplier(row),
      purchase: normalizePurchase(row),
      type: "payable",
    };
  });
}

export async function getCollectionsData(orgSlug: string) {
  const [receivables, payables] = await Promise.all([
    getReceivablesByOrgSlug(orgSlug),
    getPayablesByOrgSlug(orgSlug),
  ]);

  return { receivables, payables };
}

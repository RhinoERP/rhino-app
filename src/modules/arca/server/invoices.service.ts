import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import {
  getSalesOrdersByOrgSlug,
  type SalesOrderWithCustomer,
} from "@/modules/sales/service/sales.service";
import type { InvoiceType } from "@/modules/sales/types";
import type { Database } from "@/types/supabase";

export type AuthorizedArcaInvoiceListItem = {
  id: string;
  source: "sales_order" | "pos_sale";
  sale_number: number | string | null;
  invoice_number: string | null;
  customer: {
    id: string;
    business_name: string;
    fantasy_name: string | null;
    email: string | null;
  };
  seller: {
    id: string;
    name?: string;
    email?: string;
  } | null;
  user_id: string | null;
  sale_date: string | null;
  arca_authorized_at: string | null;
  invoice_type: InvoiceType;
  status: string | null;
  arca_cae: string | null;
  arca_point_of_sale: number | null;
  arca_voucher_number: number | null;
  total_amount: number;
  invoice_email_status: string | null;
  invoice_email_recipient: string | null;
  invoice_email_delivered_at: string | null;
  invoice_email_sent_at: string | null;
};

type PosInvoiceRaw = Pick<
  Database["public"]["Tables"]["pos_sales"]["Row"],
  | "id"
  | "receipt_number"
  | "invoice_number"
  | "customer_id"
  | "user_id"
  | "sale_date"
  | "arca_authorized_at"
  | "invoice_type"
  | "status"
  | "cae"
  | "arca_point_of_sale"
  | "arca_voucher_number"
  | "total_amount"
> & {
  customer:
    | {
        id?: string | null;
        business_name?: string | null;
        fantasy_name?: string | null;
        email?: string | null;
      }
    | Array<{
        id?: string | null;
        business_name?: string | null;
        fantasy_name?: string | null;
        email?: string | null;
      }>
    | null;
};

function toTimestamp(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function normalizeLinkedRow<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function isInvoiceType(value: string | null): value is InvoiceType {
  return (
    value === "FACTURA_A" ||
    value === "FACTURA_A_RETENCION" ||
    value === "FACTURA_B" ||
    value === "FACTURA_C" ||
    value === "FACTURA_E" ||
    value === "NOTA_DE_VENTA"
  );
}

function mapSalesOrderInvoice(
  sale: SalesOrderWithCustomer
): AuthorizedArcaInvoiceListItem {
  return {
    id: sale.id,
    source: "sales_order",
    sale_number: sale.sale_number,
    invoice_number: sale.invoice_number,
    customer: {
      id: sale.customer.id,
      business_name: sale.customer.business_name,
      fantasy_name: sale.customer.fantasy_name,
      email: sale.customer.email,
    },
    seller: sale.seller,
    user_id: sale.user_id,
    sale_date: sale.sale_date,
    arca_authorized_at: sale.arca_authorized_at,
    invoice_type: sale.invoice_type,
    status: sale.status,
    arca_cae: sale.arca_cae,
    arca_point_of_sale: sale.arca_point_of_sale,
    arca_voucher_number: sale.arca_voucher_number,
    total_amount: Number(sale.total_amount ?? 0),
    invoice_email_status: sale.invoice_email_status,
    invoice_email_recipient: sale.invoice_email_recipient,
    invoice_email_delivered_at: sale.invoice_email_delivered_at,
    invoice_email_sent_at: sale.invoice_email_sent_at,
  };
}

function mapPosSaleInvoice(sale: PosInvoiceRaw): AuthorizedArcaInvoiceListItem {
  const customer = normalizeLinkedRow(sale.customer);
  const customerId =
    customer?.id ?? sale.customer_id ?? `consumer-final-${sale.id}`;

  return {
    id: sale.id,
    source: "pos_sale",
    sale_number: sale.receipt_number,
    invoice_number: sale.invoice_number,
    customer: {
      id: customerId,
      business_name: customer?.business_name ?? "Consumidor final",
      fantasy_name: customer?.fantasy_name ?? null,
      email: customer?.email ?? null,
    },
    seller: null,
    user_id: sale.user_id,
    sale_date: sale.sale_date,
    arca_authorized_at: sale.arca_authorized_at,
    invoice_type: isInvoiceType(sale.invoice_type)
      ? sale.invoice_type
      : "FACTURA_B",
    status: sale.status,
    arca_cae: sale.cae,
    arca_point_of_sale: sale.arca_point_of_sale,
    arca_voucher_number: sale.arca_voucher_number,
    total_amount: Number(sale.total_amount ?? 0),
    invoice_email_status: null,
    invoice_email_recipient: null,
    invoice_email_delivered_at: null,
    invoice_email_sent_at: null,
  };
}

async function getAuthorizedPosInvoicesByOrgSlug(
  orgSlug: string
): Promise<AuthorizedArcaInvoiceListItem[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pos_sales")
    .select(
      `
      id,
      receipt_number,
      invoice_number,
      customer_id,
      user_id,
      sale_date,
      arca_authorized_at,
      invoice_type,
      status,
      cae,
      arca_point_of_sale,
      arca_voucher_number,
      total_amount,
      customer:customers(id, business_name, fantasy_name, email)
    `
    )
    .eq("organization_id", org.id)
    .eq("arca_status", "authorized");

  if (error) {
    throw new Error(`No se pudieron obtener facturas POS: ${error.message}`);
  }

  return ((data ?? []) as unknown as PosInvoiceRaw[]).map(mapPosSaleInvoice);
}

export async function getAuthorizedArcaInvoicesByOrgSlug(
  orgSlug: string
): Promise<AuthorizedArcaInvoiceListItem[]> {
  const [sales, posSales] = await Promise.all([
    getSalesOrdersByOrgSlug(orgSlug),
    getAuthorizedPosInvoicesByOrgSlug(orgSlug),
  ]);
  const salesInvoices = sales
    .filter((sale) => sale.arca_status === "authorized")
    .map(mapSalesOrderInvoice);

  return [...salesInvoices, ...posSales].sort(
    (a, b) =>
      toTimestamp(b.arca_authorized_at) - toTimestamp(a.arca_authorized_at)
  );
}

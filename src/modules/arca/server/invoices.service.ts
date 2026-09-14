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
  group_kind: "sale" | "preventa";
  is_primary_authorized: boolean;
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
  latest_authorized_at: string | null;
  related_documents: ArcaRelatedFiscalDocument[];
};

export type ArcaRelatedFiscalDocument = {
  id: string;
  source: "sales_order" | "credit_note";
  kind: "advance" | "credit_note" | "balance";
  invoice_number: string | null;
  invoice_type: InvoiceType;
  arca_authorized_at: string | null;
  arca_cae: string | null;
  arca_point_of_sale: number | null;
  arca_voucher_number: number | null;
  total_amount: number;
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

type AdvanceLinkRaw = Pick<
  Database["public"]["Tables"]["sales_advances"]["Row"],
  | "advance_sales_order_id"
  | "credit_note_id"
  | "final_sales_order_id"
  | "origin_type"
>;

type ArcaSalesDocumentRaw = Pick<
  Database["public"]["Tables"]["sales_orders"]["Row"],
  | "arca_authorized_at"
  | "arca_cae"
  | "arca_point_of_sale"
  | "arca_status"
  | "arca_voucher_number"
  | "document_type"
  | "id"
  | "invoice_number"
  | "invoice_type"
  | "parent_sales_order_id"
  | "total_amount"
>;

type ArcaCreditNoteRaw = Pick<
  Database["public"]["Tables"]["credit_notes"]["Row"],
  | "arca_authorized_at"
  | "arca_cae"
  | "arca_point_of_sale"
  | "arca_status"
  | "arca_voucher_number"
  | "credit_note_number"
  | "id"
  | "invoice_type"
  | "amount"
>;

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
    group_kind: sale.preventa_status ? "preventa" : "sale",
    is_primary_authorized: sale.arca_status === "authorized",
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
    latest_authorized_at: sale.arca_authorized_at,
    related_documents: [],
  };
}

function mapPosSaleInvoice(sale: PosInvoiceRaw): AuthorizedArcaInvoiceListItem {
  const customer = normalizeLinkedRow(sale.customer);
  const customerId =
    customer?.id ?? sale.customer_id ?? `consumer-final-${sale.id}`;

  return {
    id: sale.id,
    source: "pos_sale",
    group_kind: "sale",
    is_primary_authorized: true,
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
    latest_authorized_at: sale.arca_authorized_at,
    related_documents: [],
  };
}

function isAuthorized(document: { arca_status: string | null }): boolean {
  return document.arca_status === "authorized";
}

function isPreventa(sale: SalesOrderWithCustomer): boolean {
  return Boolean(sale.preventa_status);
}

function isBalanceDocument(sale: SalesOrderWithCustomer): boolean {
  return (
    sale.document_type === "BALANCE" && Boolean(sale.parent_sales_order_id)
  );
}

function mapSalesDocument(
  sale: ArcaSalesDocumentRaw,
  kind: "advance" | "balance"
): ArcaRelatedFiscalDocument {
  return {
    id: sale.id,
    source: "sales_order",
    kind,
    invoice_number: sale.invoice_number,
    invoice_type: sale.invoice_type,
    arca_authorized_at: sale.arca_authorized_at,
    arca_cae: sale.arca_cae,
    arca_point_of_sale: sale.arca_point_of_sale,
    arca_voucher_number: sale.arca_voucher_number,
    total_amount: Number(sale.total_amount ?? 0),
  };
}

function mapCreditNoteDocument(
  creditNote: ArcaCreditNoteRaw
): ArcaRelatedFiscalDocument {
  return {
    id: creditNote.id,
    source: "credit_note",
    kind: "credit_note",
    invoice_number: creditNote.credit_note_number,
    invoice_type: creditNote.invoice_type,
    arca_authorized_at: creditNote.arca_authorized_at,
    arca_cae: creditNote.arca_cae,
    arca_point_of_sale: creditNote.arca_point_of_sale,
    arca_voucher_number: creditNote.arca_voucher_number,
    total_amount: Number(creditNote.amount ?? 0),
  };
}

function withRelatedDocuments(
  invoice: AuthorizedArcaInvoiceListItem,
  relatedDocuments: ArcaRelatedFiscalDocument[]
): AuthorizedArcaInvoiceListItem {
  const relatedById = new Map<string, ArcaRelatedFiscalDocument>();
  for (const document of relatedDocuments) {
    relatedById.set(`${document.source}:${document.id}`, document);
  }
  const documents = Array.from(relatedById.values()).sort(
    (a, b) =>
      toTimestamp(a.arca_authorized_at) - toTimestamp(b.arca_authorized_at)
  );
  const latestAuthorizedAt =
    [
      invoice.arca_authorized_at,
      ...documents.map((document) => document.arca_authorized_at),
    ]
      .filter((date): date is string => Boolean(date))
      .sort((a, b) => toTimestamp(b) - toTimestamp(a))[0] ?? null;

  return {
    ...invoice,
    related_documents: documents,
    latest_authorized_at: latestAuthorizedAt,
  };
}

async function getAdvanceDocumentMaps(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  advanceSaleIds: string[];
  creditNoteIds: string[];
}) {
  const [advanceSalesResult, creditNotesResult] = await Promise.all([
    params.advanceSaleIds.length
      ? params.supabase
          .from("sales_orders")
          .select(
            "id, invoice_number, invoice_type, arca_status, arca_authorized_at, arca_cae, arca_point_of_sale, arca_voucher_number, total_amount, document_type, parent_sales_order_id"
          )
          .in("id", params.advanceSaleIds)
      : Promise.resolve({ data: [] as ArcaSalesDocumentRaw[], error: null }),
    params.creditNoteIds.length
      ? params.supabase
          .from("credit_notes")
          .select(
            "id, credit_note_number, invoice_type, arca_status, arca_authorized_at, arca_cae, arca_point_of_sale, arca_voucher_number, amount"
          )
          .in("id", params.creditNoteIds)
      : Promise.resolve({ data: [] as ArcaCreditNoteRaw[], error: null }),
  ]);

  if (advanceSalesResult.error) {
    throw new Error(
      `No se pudieron obtener facturas de anticipos: ${advanceSalesResult.error.message}`
    );
  }
  if (creditNotesResult.error) {
    throw new Error(
      `No se pudieron obtener notas de crédito de anticipos: ${creditNotesResult.error.message}`
    );
  }

  return {
    advanceSalesById: new Map(
      ((advanceSalesResult.data ?? []) as ArcaSalesDocumentRaw[]).map(
        (sale) => [sale.id, sale]
      )
    ),
    creditNotesById: new Map(
      ((creditNotesResult.data ?? []) as ArcaCreditNoteRaw[]).map(
        (creditNote) => [creditNote.id, creditNote]
      )
    ),
  };
}

function collectAuthorizedAdvanceDocuments(params: {
  advanceLinks: AdvanceLinkRaw[];
  advanceSalesById: Map<string, ArcaSalesDocumentRaw>;
  creditNotesById: Map<string, ArcaCreditNoteRaw>;
}) {
  const relatedDocumentsBySaleId = new Map<
    string,
    ArcaRelatedFiscalDocument[]
  >();

  for (const advance of params.advanceLinks) {
    const documents =
      relatedDocumentsBySaleId.get(advance.final_sales_order_id) ?? [];
    const advanceSale = advance.advance_sales_order_id
      ? params.advanceSalesById.get(advance.advance_sales_order_id)
      : null;
    const creditNote = advance.credit_note_id
      ? params.creditNotesById.get(advance.credit_note_id)
      : null;

    if (advanceSale && isAuthorized(advanceSale)) {
      documents.push(mapSalesDocument(advanceSale, "advance"));
    }
    if (creditNote && isAuthorized(creditNote)) {
      documents.push(mapCreditNoteDocument(creditNote));
    }
    relatedDocumentsBySaleId.set(advance.final_sales_order_id, documents);
  }

  return relatedDocumentsBySaleId;
}

async function getAdvanceRelatedDocuments(params: {
  organizationId: string;
  visibleSaleIds: string[];
}): Promise<Map<string, ArcaRelatedFiscalDocument[]>> {
  if (!params.visibleSaleIds.length) {
    return new Map();
  }

  const supabase = await createClient();
  const { data: advances, error: advancesError } = await supabase
    .from("sales_advances")
    .select(
      "final_sales_order_id, advance_sales_order_id, credit_note_id, origin_type"
    )
    .eq("organization_id", params.organizationId)
    .in("final_sales_order_id", params.visibleSaleIds);

  if (advancesError) {
    throw new Error(
      `No se pudieron obtener comprobantes de anticipos: ${advancesError.message}`
    );
  }

  const advanceLinks = (advances ?? []) as AdvanceLinkRaw[];
  const { advanceSalesById, creditNotesById } = await getAdvanceDocumentMaps({
    supabase,
    advanceSaleIds: Array.from(
      new Set(
        advanceLinks
          .map((advance) => advance.advance_sales_order_id)
          .filter((id): id is string => Boolean(id))
      )
    ),
    creditNoteIds: Array.from(
      new Set(
        advanceLinks
          .map((advance) => advance.credit_note_id)
          .filter((id): id is string => Boolean(id))
      )
    ),
  });

  return collectAuthorizedAdvanceDocuments({
    advanceLinks,
    advanceSalesById,
    creditNotesById,
  });
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

function getAuthorizedBalanceDocumentsByPreventaId(
  sales: SalesOrderWithCustomer[]
): Map<string, ArcaRelatedFiscalDocument[]> {
  const preventaIds = new Set(sales.filter(isPreventa).map((sale) => sale.id));
  const balanceDocumentsByPreventaId = new Map<
    string,
    ArcaRelatedFiscalDocument[]
  >();

  for (const sale of sales) {
    if (
      !(
        isBalanceDocument(sale) &&
        sale.parent_sales_order_id &&
        preventaIds.has(sale.parent_sales_order_id) &&
        isAuthorized(sale)
      )
    ) {
      continue;
    }
    const documents =
      balanceDocumentsByPreventaId.get(sale.parent_sales_order_id) ?? [];
    documents.push(mapSalesDocument(sale as ArcaSalesDocumentRaw, "balance"));
    balanceDocumentsByPreventaId.set(sale.parent_sales_order_id, documents);
  }

  return balanceDocumentsByPreventaId;
}

export function buildAuthorizedArcaInvoiceGroups(params: {
  sales: SalesOrderWithCustomer[];
  posSales: AuthorizedArcaInvoiceListItem[];
  relatedDocumentsBySaleId: Map<string, ArcaRelatedFiscalDocument[]>;
}): AuthorizedArcaInvoiceListItem[] {
  const visibleParentSales = params.sales.filter(
    (sale) => !isBalanceDocument(sale)
  );
  const balanceDocumentsByPreventaId =
    getAuthorizedBalanceDocumentsByPreventaId(params.sales);
  const salesInvoices = visibleParentSales
    .map((sale) => {
      const relatedDocuments = [
        ...(params.relatedDocumentsBySaleId.get(sale.id) ?? []),
        ...(balanceDocumentsByPreventaId.get(sale.id) ?? []),
      ];
      const invoice = withRelatedDocuments(
        mapSalesOrderInvoice(sale),
        relatedDocuments
      );
      return invoice.is_primary_authorized ||
        invoice.related_documents.length > 0
        ? invoice
        : null;
    })
    .filter((invoice): invoice is AuthorizedArcaInvoiceListItem =>
      Boolean(invoice)
    );

  return [...salesInvoices, ...params.posSales].sort(
    (a, b) =>
      toTimestamp(b.latest_authorized_at) - toTimestamp(a.latest_authorized_at)
  );
}

export async function getAuthorizedArcaInvoicesByOrgSlug(
  orgSlug: string
): Promise<AuthorizedArcaInvoiceListItem[]> {
  const [organization, sales, posSales] = await Promise.all([
    getOrganizationBySlug(orgSlug),
    getSalesOrdersByOrgSlug(orgSlug),
    getAuthorizedPosInvoicesByOrgSlug(orgSlug),
  ]);

  if (!organization?.id) {
    throw new Error("Organización no encontrada");
  }

  const visibleParentSales = sales.filter((sale) => !isBalanceDocument(sale));
  const relatedDocumentsBySaleId = await getAdvanceRelatedDocuments({
    organizationId: organization.id,
    visibleSaleIds: visibleParentSales.map((sale) => sale.id),
  });
  return buildAuthorizedArcaInvoiceGroups({
    sales,
    posSales,
    relatedDocumentsBySaleId,
  });
}

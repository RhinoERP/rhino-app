import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { getSalesAccessContext } from "@/modules/sales/service/sales.service";

const DOCUMENT_SELECT = `
  id,
  source_key,
  document_code,
  document_name,
  document_letter,
  document_series,
  document_number,
  printed_number,
  document_class,
  revenue_sign,
  is_fiscal,
  is_reference_only,
  customer_chess_code,
  document_date,
  cancelled,
  settlement_status,
  total_amount,
  customer:customers(business_name,fantasy_name)
`;

export type ChessHistoricalSalesFilters = {
  page: number;
  pageSize: number;
  search?: string;
  documentCode?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type ChessHistoricalSalesDocument = {
  id: string;
  source_key: string;
  document_code: string;
  document_name: string;
  document_letter: string;
  document_series: number;
  document_number: number;
  printed_number: string | null;
  document_class: "SALE" | "CREDIT_NOTE" | "DEBIT_NOTE";
  revenue_sign: number;
  is_fiscal: boolean;
  is_reference_only: boolean;
  customer_chess_code: string | null;
  document_date: string;
  cancelled: boolean;
  settlement_status:
    | "UNVERIFIED"
    | "PAID"
    | "OPEN"
    | "PARTIAL"
    | "NOT_APPLICABLE";
  total_amount: number;
  customer: {
    business_name: string | null;
    fantasy_name: string | null;
  } | null;
};

export type ChessHistoricalSalesPage = {
  data: ChessHistoricalSalesDocument[];
  totalCount: number;
  page: number;
  pageSize: number;
};

export type ChessHistoricalSalesProductMetric = {
  product_id: string | null;
  product_chess_code: string;
  product_name: string;
  signed_quantity: number | null;
  signed_remainder_quantity: number;
  signed_amount: number;
  document_count: number;
};

async function getReadableOrganization(orgSlug: string) {
  const [organization, access] = await Promise.all([
    getOrganizationBySlug(orgSlug),
    getSalesAccessContext(orgSlug),
  ]);
  if (!(organization?.id && access.canRead && access.canViewAll)) {
    return null;
  }
  return organization;
}

export async function getChessHistoricalSalesPage(
  orgSlug: string,
  filters: ChessHistoricalSalesFilters
): Promise<ChessHistoricalSalesPage | null> {
  const organization = await getReadableOrganization(orgSlug);
  if (!organization) {
    return null;
  }

  const page = Math.max(1, filters.page);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const supabase = await createClient();
  // The historical tables are introduced by a migration and are not yet in the
  // generated Supabase schema types for every deployed environment.
  // biome-ignore lint/suspicious/noExplicitAny: pending regenerated Supabase table types
  let query: any = supabase
    .from("historical_sales_documents" as never)
    .select(DOCUMENT_SELECT, { count: "exact" })
    .eq("organization_id", organization.id)
    .eq("is_reference_only", false)
    .order("document_date", { ascending: false })
    .order("document_number", { ascending: false });

  if (filters.search?.trim()) {
    query = query.ilike("printed_number", `%${filters.search.trim()}%`);
  }
  if (filters.documentCode) {
    query = query.eq("document_code", filters.documentCode);
  }
  if (filters.dateFrom) {
    query = query.gte("document_date", filters.dateFrom);
  }
  if (filters.dateTo) {
    query = query.lte("document_date", filters.dateTo);
  }

  const { data, count, error } = await query.range(from, to);
  if (error) {
    throw new Error(
      `No se pudo consultar el histórico CHESS: ${error.message}`
    );
  }

  return {
    data: (data ?? []) as ChessHistoricalSalesDocument[],
    totalCount: count ?? 0,
    page,
    pageSize,
  };
}

export async function getChessHistoricalSalesProductMetrics(
  orgSlug: string,
  dateFrom: string,
  dateTo: string,
  limit = 20
): Promise<ChessHistoricalSalesProductMetric[] | null> {
  const organization = await getReadableOrganization(orgSlug);
  if (!organization) {
    return null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "get_historical_sales_product_metrics" as never,
    {
      p_org_id: organization.id,
      p_date_from: dateFrom,
      p_date_to: dateTo,
      p_limit: limit,
    } as never
  );
  if (error) {
    throw new Error(
      `No se pudieron calcular métricas por producto: ${error.message}`
    );
  }
  return (data ?? []) as ChessHistoricalSalesProductMetric[];
}

export type ChessHistoricalSalesLine = {
  id: string;
  line_number: number;
  product_chess_code: string | null;
  description: string;
  quantity: number;
  remainder_quantity: number;
  units_per_box: number | null;
  base_unit_quantity: number | null;
  unit_price: number;
  total_amount: number;
  cancelled: boolean;
  generic_merchandise: boolean;
  product: { sku: string | null; name: string | null } | null;
};

export type ChessHistoricalSalesLink = {
  id: string;
  target_document_id: string | null;
  target_source_key: string;
  target_document_code: string;
  target_letter: string;
  target_series: number;
  target_number: number;
  target_line_number: number | null;
  target_product_chess_code: string | null;
  target_description: string | null;
  relation_type: string;
};

export type ChessHistoricalSalesDetail = {
  document: ChessHistoricalSalesDocument;
  items: ChessHistoricalSalesLine[];
  links: ChessHistoricalSalesLink[];
};

export async function getChessHistoricalSalesDetail(
  orgSlug: string,
  documentId: string
): Promise<ChessHistoricalSalesDetail | null> {
  const organization = await getReadableOrganization(orgSlug);
  if (!organization) {
    return null;
  }

  const supabase = await createClient();
  // biome-ignore lint/suspicious/noExplicitAny: pending regenerated Supabase table types
  const table: any = supabase.from("historical_sales_documents" as never);
  const [
    { data: document, error: documentError },
    { data: items, error: itemsError },
    { data: links, error: linksError },
  ] = await Promise.all([
    table
      .select(DOCUMENT_SELECT)
      .eq("organization_id", organization.id)
      .eq("id", documentId)
      .maybeSingle(),
    supabase
      .from("historical_sales_document_items" as never)
      .select(
        "id,line_number,product_chess_code,description,quantity,remainder_quantity,units_per_box,base_unit_quantity,unit_price,total_amount,cancelled,generic_merchandise,product:products(sku,name)"
      )
      .eq("organization_id" as never, organization.id as never)
      .eq("historical_document_id" as never, documentId as never)
      .order("line_number" as never),
    supabase
      .from("historical_sales_document_links" as never)
      .select(
        "id,target_document_id,target_source_key,target_document_code,target_letter,target_series,target_number,target_line_number,target_product_chess_code,target_description,relation_type"
      )
      .eq("organization_id" as never, organization.id as never)
      .eq("source_document_id" as never, documentId as never),
  ]);

  if (documentError || itemsError || linksError) {
    const error = documentError ?? itemsError ?? linksError;
    throw new Error(
      `No se pudo abrir el comprobante histórico: ${error.message}`
    );
  }
  if (!document) {
    return null;
  }

  return {
    document: document as ChessHistoricalSalesDocument,
    items: (items ?? []) as unknown as ChessHistoricalSalesLine[],
    links: (links ?? []) as unknown as ChessHistoricalSalesLink[],
  };
}

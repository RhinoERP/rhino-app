import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { getSalesAccessContext } from "@/modules/sales/service/sales.service";
import type { SortParam } from "@/types/pagination";
import {
  type ChessHistoricalDocumentLink,
  groupChessHistoricalLinks,
} from "./chess-historical-link-grouping";

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
  gross_amount,
  discount_amount,
  net_taxable_amount,
  net_other_amount,
  non_taxable_amount,
  exempt_amount,
  vat_1_amount,
  vat_1_fiscal_amount,
  vat_2_amount,
  perception_212_amount,
  perception_3337_amount,
  perception_iibb_amount,
  internal_tax_amount,
  detraccion_amount,
  total_amount,
  customer:customers(business_name,fantasy_name)
`;

const NON_FILTER_CHARS = /[%,()]/g;
const NUMERIC_DOCUMENT_NUMBER = /^\d+$/;

export type ChessHistoricalSalesFilters = {
  page: number;
  pageSize: number;
  search?: string;
  documentCode?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: SortParam[];
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
  gross_amount: number | null;
  discount_amount: number | null;
  net_taxable_amount: number | null;
  net_other_amount: number | null;
  non_taxable_amount: number | null;
  exempt_amount: number | null;
  vat_1_amount: number | null;
  vat_1_fiscal_amount: number | null;
  vat_2_amount: number | null;
  perception_212_amount: number | null;
  perception_3337_amount: number | null;
  perception_iibb_amount: number | null;
  internal_tax_amount: number | null;
  detraccion_amount: number | null;
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

async function applyHistoricalSearch(
  // biome-ignore lint/suspicious/noExplicitAny: historical table types are not generated yet
  query: any,
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  rawSearch: string
) {
  const search = rawSearch.trim().replace(NON_FILTER_CHARS, " ").trim();
  if (!search) {
    return query;
  }

  const conditions = [
    `printed_number.ilike.%${search}%`,
    `document_code.ilike.%${search}%`,
  ];
  if (NUMERIC_DOCUMENT_NUMBER.test(search)) {
    conditions.push(`document_number.eq.${Number.parseInt(search, 10)}`);
  }

  const { data: customers, error } = await supabase
    .from("customers")
    .select("id")
    .eq("organization_id", orgId)
    .or(`business_name.ilike.%${search}%,fantasy_name.ilike.%${search}%`)
    .limit(200);
  if (error) {
    throw new Error(
      `No se pudieron buscar clientes del histórico: ${error.message}`
    );
  }
  if (customers?.length) {
    conditions.push(
      `customer_id.in.(${customers.map((row) => row.id).join(",")})`
    );
  }
  return query.or(conditions.join(","));
}

function applyHistoricalFilters(
  // biome-ignore lint/suspicious/noExplicitAny: historical table types are not generated yet
  query: any,
  filters: ChessHistoricalSalesFilters
) {
  let filteredQuery = query;
  if (filters.documentCode) {
    filteredQuery = filteredQuery.eq("document_code", filters.documentCode);
  }
  if (filters.dateFrom) {
    filteredQuery = filteredQuery.gte("document_date", filters.dateFrom);
  }
  if (filters.dateTo) {
    filteredQuery = filteredQuery.lte("document_date", filters.dateTo);
  }
  return filteredQuery;
}

// biome-ignore lint/suspicious/noExplicitAny: historical table types are not generated yet
function applyHistoricalSort(query: any, sorts: SortParam[] | undefined) {
  const allowed = new Set([
    "document_date",
    "document_number",
    "document_code",
  ]);
  const selected = sorts?.find((sort) => allowed.has(sort.id));
  if (!selected) {
    return query
      .order("document_date", { ascending: false })
      .order("document_number", { ascending: false });
  }
  const sortedQuery = query.order(selected.id, { ascending: !selected.desc });
  return selected.id === "document_date"
    ? sortedQuery
    : sortedQuery.order("document_date", { ascending: false });
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
  const pageSize = Math.min(50, Math.max(1, filters.pageSize));
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

  if (filters.search) {
    query = await applyHistoricalSearch(
      query,
      supabase,
      organization.id,
      filters.search
    );
  }
  query = applyHistoricalFilters(query, filters);
  query = applyHistoricalSort(query, filters.sort);

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
  gross_amount: number | null;
  final_price: number | null;
  freight_amount: number | null;
  discount_percentage: number;
  discount_amount: number;
  total_amount: number;
  net_amount: number;
  non_taxable_amount: number | null;
  exempt_amount: number | null;
  tax_iva_1: number;
  tax_iva_2: number;
  perception_212_amount: number | null;
  perception_3337_amount: number | null;
  perception_iibb_amount: number | null;
  internal_tax_amount: number | null;
  detraccion_amount: number | null;
  cancelled: boolean;
  generic_merchandise: boolean;
  product: { sku: string | null; name: string | null } | null;
};

export type ChessHistoricalSalesLink = ChessHistoricalDocumentLink;

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
        "id,line_number,product_chess_code,description,quantity,remainder_quantity,units_per_box,base_unit_quantity,unit_price,gross_amount,final_price,freight_amount,discount_percentage,discount_amount,net_amount,non_taxable_amount,exempt_amount,tax_iva_1,tax_iva_2,perception_212_amount,perception_3337_amount,perception_iibb_amount,internal_tax_amount,detraccion_amount,total_amount,cancelled,generic_merchandise,product:products(sku,name)"
      )
      .eq("organization_id" as never, organization.id as never)
      .eq("historical_document_id" as never, documentId as never)
      .order("line_number" as never),
    supabase
      .from("historical_sales_document_links" as never)
      .select(
        "id,target_document_id,target_source_key,target_document_code,target_document_name,target_letter,target_series,target_number,target_document_date,target_printed_number,target_relation_type,target_line_number,target_product_chess_code,target_description,relation_type"
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

  const groupedLinks = groupChessHistoricalLinks(
    (links ?? []) as Record<string, unknown>[]
  );

  return {
    document: document as ChessHistoricalSalesDocument,
    items: (items ?? []) as unknown as ChessHistoricalSalesLine[],
    links: groupedLinks,
  };
}

export type ChessHistoricalSalesReference = {
  target_source_key: string;
  target_document_code: string;
  target_document_name: string | null;
  target_letter: string;
  target_series: number;
  target_number: number;
  target_document_date: string | null;
  target_printed_number: string | null;
  target_relation_type: string | null;
  related_lines: Array<{
    line_number: number | null;
    product_chess_code: string | null;
    description: string | null;
  }>;
  source_documents: Array<{
    id: string;
    printed_number: string | null;
    document_code: string;
    document_name: string;
    document_date: string;
  }>;
};

export async function getChessHistoricalSalesReference(
  orgSlug: string,
  targetSourceKey: string
): Promise<ChessHistoricalSalesReference | null> {
  const organization = await getReadableOrganization(orgSlug);
  if (!(organization && targetSourceKey.trim())) {
    return null;
  }

  const supabase = await createClient();
  // biome-ignore lint/suspicious/noExplicitAny: pending regenerated Supabase table types
  const linksTable: any = supabase.from(
    "historical_sales_document_links" as never
  );
  const { data: rows, error: linksError } = await linksTable
    .select(
      "source_document_id,target_document_code,target_document_name,target_letter,target_series,target_number,target_document_date,target_printed_number,target_relation_type,target_line_number,target_product_chess_code,target_description"
    )
    .eq("organization_id", organization.id)
    .eq("target_source_key", targetSourceKey)
    .limit(200);
  if (linksError) {
    throw new Error(
      `No se pudo consultar la referencia CHESS: ${linksError.message}`
    );
  }
  if (!rows?.length) {
    return null;
  }

  const sourceIds = Array.from(
    new Set(
      rows.map((row: { source_document_id: string }) => row.source_document_id)
    )
  );
  const { data: sourceDocuments, error: sourceError } = await supabase
    .from("historical_sales_documents" as never)
    .select("id,printed_number,document_code,document_name,document_date")
    .eq("organization_id" as never, organization.id as never)
    .in("id" as never, sourceIds as never);
  if (sourceError) {
    throw new Error(
      `No se pudieron consultar los comprobantes de origen: ${sourceError.message}`
    );
  }

  const lineKeys = new Set<string>();
  const relatedLines = rows.flatMap((row: Record<string, unknown>) => {
    const lineNumber = row.target_line_number
      ? Number(row.target_line_number)
      : null;
    const productCode = row.target_product_chess_code
      ? String(row.target_product_chess_code)
      : null;
    const description = row.target_description
      ? String(row.target_description)
      : null;
    if (lineNumber === null && !productCode && !description) {
      return [];
    }
    const key = `${lineNumber ?? ""}|${productCode ?? ""}|${description ?? ""}`;
    if (lineKeys.has(key)) {
      return [];
    }
    lineKeys.add(key);
    return [
      { line_number: lineNumber, product_chess_code: productCode, description },
    ];
  });

  const first = rows[0] as Record<string, unknown>;
  return {
    target_source_key: targetSourceKey,
    target_document_code: String(first.target_document_code ?? ""),
    target_document_name: first.target_document_name
      ? String(first.target_document_name)
      : null,
    target_letter: String(first.target_letter ?? ""),
    target_series: Number(first.target_series ?? 0),
    target_number: Number(first.target_number ?? 0),
    target_document_date: first.target_document_date
      ? String(first.target_document_date)
      : null,
    target_printed_number: first.target_printed_number
      ? String(first.target_printed_number)
      : null,
    target_relation_type: first.target_relation_type
      ? String(first.target_relation_type)
      : null,
    related_lines: relatedLines,
    source_documents: (sourceDocuments ??
      []) as unknown as ChessHistoricalSalesReference["source_documents"],
  };
}

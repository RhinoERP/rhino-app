import { createAdminClient } from "@/lib/supabase/admin-client";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { SalesQuotePricingMethod } from "../competitive-pricing";

export type SalesQuoteRequestReviewItem = {
  id: string;
  line_number: number;
  product_name_snapshot: string;
  sku_snapshot: string | null;
  unit_of_measure_snapshot: string | null;
  quantity: number;
  pricing_method: SalesQuotePricingMethod;
  base_unit_price: number;
  competitor_unit_price: number;
  agreed_unit_price: number;
  discount_percentage: number;
  discount_amount: number;
  price_increase_amount: number;
  unit_cost_snapshot: number | null;
  adjustment_type: string;
  line_subtotal: number;
  product_comment: string | null;
};

export type SalesQuoteRequestReview = {
  id: string;
  customer_id: string;
  created_by: string;
  seller_name_snapshot: string | null;
  seller_zone_snapshot: string | null;
  customer_segment: string;
  currency: string;
  exchange_rate: number | null;
  payment_method: string | null;
  payment_term: string | null;
  invoice_type: string | null;
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
  seller_observations: string | null;
  created_at: string;
  customer_name: string;
  items: SalesQuoteRequestReviewItem[];
};

type QueryResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

type ReviewQuery = {
  eq(column: string, value: string): ReviewQuery;
  in(column: string, values: string[]): ReviewQuery;
  order(column: string, options: { ascending: boolean }): ReviewQuery;
};

type ReviewDatabaseClient = {
  from(table: string): {
    select(columns: string): ReviewQuery;
  };
};

type RequestRow = Omit<SalesQuoteRequestReview, "customer_name" | "items">;
type CustomerRow = {
  id: string;
  fantasy_name: string | null;
  business_name: string | null;
};

async function executeQuery<T>(query: ReviewQuery): Promise<QueryResult<T>> {
  return (await (query as unknown as Promise<
    QueryResult<T>
  >)) as QueryResult<T>;
}

export async function getPendingSalesQuoteRequestsByOrgSlug(
  orgSlug: string
): Promise<SalesQuoteRequestReview[]> {
  const organization = await getOrganizationBySlug(orgSlug);
  if (!organization?.id) {
    throw new Error("Organización no encontrada");
  }

  const database = createAdminClient() as unknown as ReviewDatabaseClient;
  const requestQuery = database
    .from("sales_quote_requests")
    .select(
      "id, customer_id, created_by, seller_name_snapshot, seller_zone_snapshot, customer_segment, currency, exchange_rate, payment_method, payment_term, invoice_type, subtotal_amount, tax_amount, total_amount, seller_observations, created_at"
    )
    .eq("organization_id", organization.id)
    .eq("status", "PENDING_APPROVAL")
    .order("created_at", { ascending: true });
  const { data: requests, error: requestError } =
    await executeQuery<RequestRow[]>(requestQuery);
  if (requestError) {
    throw new Error(
      `No se pudieron cargar las solicitudes: ${requestError.message}`
    );
  }
  if (!requests?.length) {
    return [];
  }

  const requestIds = requests.map((request) => request.id);
  const customerIds = [
    ...new Set(requests.map((request) => request.customer_id)),
  ];
  const itemQuery = database
    .from("sales_quote_request_items")
    .select(
      "id, request_id, line_number, product_name_snapshot, sku_snapshot, unit_of_measure_snapshot, quantity, pricing_method, base_unit_price, competitor_unit_price, agreed_unit_price, discount_percentage, discount_amount, price_increase_amount, unit_cost_snapshot, adjustment_type, line_subtotal, product_comment"
    )
    .in("request_id", requestIds)
    .order("line_number", { ascending: true });
  const customerQuery = database
    .from("customers")
    .select("id, fantasy_name, business_name")
    .in("id", customerIds);

  const [itemResult, customerResult] = await Promise.all([
    executeQuery<(SalesQuoteRequestReviewItem & { request_id: string })[]>(
      itemQuery
    ),
    executeQuery<CustomerRow[]>(customerQuery),
  ]);

  if (itemResult.error) {
    throw new Error(
      `No se pudieron cargar los productos: ${itemResult.error.message}`
    );
  }
  if (customerResult.error) {
    throw new Error(
      `No se pudieron cargar los clientes: ${customerResult.error.message}`
    );
  }

  const customerById = new Map(
    (customerResult.data ?? []).map((customer) => [customer.id, customer])
  );
  const itemsByRequestId = new Map<string, SalesQuoteRequestReviewItem[]>();
  for (const item of itemResult.data ?? []) {
    const { request_id: requestId, ...reviewItem } = item;
    const currentItems = itemsByRequestId.get(requestId) ?? [];
    currentItems.push(reviewItem);
    itemsByRequestId.set(requestId, currentItems);
  }

  return requests.map((request) => {
    const customer = customerById.get(request.customer_id);
    return {
      ...request,
      customer_name:
        customer?.fantasy_name || customer?.business_name || "Cliente",
      items: itemsByRequestId.get(request.id) ?? [],
    };
  });
}

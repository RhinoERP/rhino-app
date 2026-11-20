import { createAdminClient } from "@/lib/supabase/admin-client";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { SalesQuotePricingMethod } from "../competitive-pricing";

export type MySalesQuoteRequest = {
  id: string;
  status: string;
  currency: string;
  subtotal_amount: number;
  total_amount: number;
  created_at: string;
  review_comment: string | null;
  cancellation_observation: string | null;
  sales_order_id: string | null;
  customer_name: string;
  item_count: number;
  history: Array<{
    id: string;
    changed_at: string;
    changed_by_name: string | null;
    event_type: string;
    event_comment: string | null;
    items_snapshot: Array<{ product_name_snapshot?: string }>;
    request_snapshot: {
      status?: string;
      total_amount: number;
      currency: string;
    };
  }>;
};

export type SalesQuoteRequestEditValues = {
  customerId: string;
  customerSegment: "ACTIVE" | "NEW" | "REACTIVATED";
  sellerZone: string;
  currency: "ARS" | "USD";
  exchangeRate: number | null;
  priceLevelId: string | null;
  salesPriceListId: string | null;
  paymentMethod: string;
  paymentTerm: string;
  invoiceType: string;
  observations: string;
  items: Array<{
    productId: string;
    productVariantId: string | null;
    quantity: number;
    pricingMethod: SalesQuotePricingMethod;
    competitorUnitPrice: number;
    agreedUnitPrice: number;
    discountPercentage: number;
    comment: string;
  }>;
};

type QueryResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

type Query = {
  eq(column: string, value: string): Query;
  in(column: string, values: string[]): Query;
  order(column: string, options: { ascending: boolean }): Query;
};

type DatabaseClient = {
  from(table: string): { select(columns: string): Query };
};

type RequestRow = Omit<MySalesQuoteRequest, "customer_name" | "item_count"> & {
  customer_id: string;
};
type CustomerRow = {
  id: string;
  fantasy_name: string | null;
  business_name: string | null;
};
type ItemRow = { request_id: string };
type HistoryRow = {
  id: string;
  request_id: string;
  changed_at: string;
  items_snapshot: Array<{ product_name_snapshot?: string }>;
  request_snapshot: { total_amount: number; currency: string };
};
type EventRow = {
  id: string;
  request_id: string;
  changed_at: string;
  changed_by: string | null;
  changed_by_name: string | null;
  event_type: string;
  event_comment: string | null;
  items_snapshot: Array<{ product_name_snapshot?: string }>;
  request_snapshot: {
    status?: string;
    total_amount: number;
    currency: string;
  };
};
type EditableRequestRow = {
  id: string;
  created_by: string;
  status: string;
  customer_id: string;
  customer_segment: SalesQuoteRequestEditValues["customerSegment"];
  seller_zone_snapshot: string | null;
  currency: "ARS" | "USD";
  exchange_rate: number | null;
  price_level_id: string | null;
  sales_price_list_id: string | null;
  payment_method: string | null;
  payment_term: string | null;
  invoice_type: string | null;
  seller_observations: string | null;
};
type EditableItemRow = {
  product_id: string;
  product_variant_id: string | null;
  quantity: number;
  pricing_method: SalesQuotePricingMethod;
  competitor_unit_price: number;
  agreed_unit_price: number;
  discount_percentage: number;
  product_comment: string | null;
};
export type SalesQuoteRequestDetail = {
  id: string;
  status: string;
  currency: string;
  customer_name: string;
  created_at: string;
  seller_name_snapshot: string | null;
  seller_zone_snapshot: string | null;
  customer_segment: string;
  payment_method: string | null;
  payment_term: string | null;
  invoice_type: string | null;
  exchange_rate: number | null;
  seller_observations: string | null;
  review_comment: string | null;
  cancellation_observation: string | null;
  sales_order_id: string | null;
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
  items: Array<{
    id: string;
    product_name_snapshot: string;
    sku_snapshot: string | null;
    unit_of_measure_snapshot: string | null;
    quantity: number;
    pricing_method: SalesQuotePricingMethod;
    base_unit_price: number;
    competitor_unit_price: number;
    agreed_unit_price: number;
    discount_percentage: number;
    line_subtotal: number;
    product_comment: string | null;
  }>;
};
type DetailRequestRow = Omit<
  SalesQuoteRequestDetail,
  "customer_name" | "items"
> & {
  customer_id: string;
};
type DetailCustomerRow = CustomerRow;
type DetailItemRow = SalesQuoteRequestDetail["items"][number] & {
  request_id: string;
};

async function executeQuery<T>(query: Query): Promise<QueryResult<T>> {
  return (await (query as unknown as Promise<
    QueryResult<T>
  >)) as QueryResult<T>;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: aggregates requests, customers, line counts, edits, and lifecycle events for the seller history.
export async function getMySalesQuoteRequestsByOrgSlug(
  orgSlug: string,
  userId: string
): Promise<MySalesQuoteRequest[]> {
  const organization = await getOrganizationBySlug(orgSlug);
  if (!organization?.id) {
    throw new Error("Organización no encontrada");
  }

  const database = createAdminClient() as unknown as DatabaseClient;
  const requestQuery = database
    .from("sales_quote_requests")
    .select(
      "id, customer_id, status, currency, subtotal_amount, total_amount, created_at, review_comment, cancellation_observation, sales_order_id"
    )
    .eq("organization_id", organization.id)
    .eq("created_by", userId)
    .order("created_at", { ascending: false });
  const { data: requests, error } =
    await executeQuery<RequestRow[]>(requestQuery);
  if (error) {
    throw new Error(`No se pudieron cargar tus cotizaciones: ${error.message}`);
  }
  if (!requests?.length) {
    return [];
  }

  const requestIds = requests.map((request) => request.id);
  const customerIds = [
    ...new Set(requests.map((request) => request.customer_id)),
  ];
  const [customersResult, itemsResult, historyResult, eventsResult] =
    await Promise.all([
      executeQuery<CustomerRow[]>(
        database
          .from("customers")
          .select("id, fantasy_name, business_name")
          .in("id", customerIds)
      ),
      executeQuery<ItemRow[]>(
        database
          .from("sales_quote_request_items")
          .select("request_id")
          .in("request_id", requestIds)
      ),
      executeQuery<HistoryRow[]>(
        database
          .from("sales_quote_request_history")
          .select(
            "id, request_id, changed_at, items_snapshot, request_snapshot"
          )
          .in("request_id", requestIds)
          .order("changed_at", { ascending: false })
      ),
      executeQuery<EventRow[]>(
        database
          .from("sales_quote_request_events")
          .select(
            "id, request_id, changed_at, changed_by, changed_by_name, event_type, event_comment, items_snapshot, request_snapshot"
          )
          .in("request_id", requestIds)
          .order("changed_at", { ascending: false })
      ),
    ]);

  if (customersResult.error) {
    throw new Error(
      `No se pudieron cargar los clientes: ${customersResult.error.message}`
    );
  }
  if (itemsResult.error) {
    throw new Error(
      `No se pudieron cargar los productos: ${itemsResult.error.message}`
    );
  }
  if (historyResult.error) {
    throw new Error(
      `No se pudo cargar el historial: ${historyResult.error.message}`
    );
  }
  if (eventsResult.error) {
    throw new Error(
      `No se pudo cargar la actividad: ${eventsResult.error.message}`
    );
  }

  const customers = new Map(
    (customersResult.data ?? []).map((customer) => [customer.id, customer])
  );
  const itemCounts = new Map<string, number>();
  for (const item of itemsResult.data ?? []) {
    itemCounts.set(item.request_id, (itemCounts.get(item.request_id) ?? 0) + 1);
  }
  const historyByRequest = new Map<string, MySalesQuoteRequest["history"]>();
  for (const entry of historyResult.data ?? []) {
    const requestHistory = historyByRequest.get(entry.request_id) ?? [];
    requestHistory.push({
      id: entry.id,
      changed_at: entry.changed_at,
      changed_by_name: null,
      event_type: "PREVIOUS_VERSION",
      event_comment: null,
      items_snapshot: entry.items_snapshot ?? [],
      request_snapshot: entry.request_snapshot,
    });
    historyByRequest.set(entry.request_id, requestHistory);
  }
  for (const entry of eventsResult.data ?? []) {
    const requestHistory = historyByRequest.get(entry.request_id) ?? [];
    requestHistory.push({
      id: entry.id,
      changed_at: entry.changed_at,
      changed_by_name: entry.changed_by_name,
      event_type: entry.event_type,
      event_comment: entry.event_comment,
      items_snapshot: entry.items_snapshot ?? [],
      request_snapshot: entry.request_snapshot,
    });
    historyByRequest.set(entry.request_id, requestHistory);
  }
  for (const entries of historyByRequest.values()) {
    entries.sort(
      (left, right) =>
        new Date(right.changed_at).getTime() -
        new Date(left.changed_at).getTime()
    );
  }

  return requests.map(({ customer_id: customerId, ...request }) => {
    const customer = customers.get(customerId);
    return {
      ...request,
      customer_name:
        customer?.fantasy_name || customer?.business_name || "Cliente",
      item_count: itemCounts.get(request.id) ?? 0,
      history: historyByRequest.get(request.id) ?? [],
    };
  });
}

export async function getOwnSalesQuoteRequestForEdit(params: {
  orgSlug: string;
  userId: string;
  requestId: string;
}): Promise<SalesQuoteRequestEditValues | null> {
  const organization = await getOrganizationBySlug(params.orgSlug);
  if (!organization?.id) {
    throw new Error("Organización no encontrada");
  }
  const database = createAdminClient() as unknown as DatabaseClient;
  const requestQuery = database
    .from("sales_quote_requests")
    .select(
      "id, created_by, status, customer_id, customer_segment, seller_zone_snapshot, currency, exchange_rate, price_level_id, sales_price_list_id, payment_method, payment_term, invoice_type, seller_observations"
    )
    .eq("id", params.requestId)
    .eq("organization_id", organization.id)
    .eq("created_by", params.userId);
  const { data: rows, error } =
    await executeQuery<EditableRequestRow[]>(requestQuery);
  if (error) {
    throw new Error(`No se pudo cargar la cotización: ${error.message}`);
  }
  const request = rows?.[0];
  if (!(request && ["PENDING_APPROVAL", "RETURNED"].includes(request.status))) {
    return null;
  }

  const itemsQuery = database
    .from("sales_quote_request_items")
    .select(
      "product_id, product_variant_id, quantity, pricing_method, competitor_unit_price, agreed_unit_price, discount_percentage, product_comment"
    )
    .eq("request_id", request.id)
    .order("line_number", { ascending: true });
  const { data: items, error: itemsError } =
    await executeQuery<EditableItemRow[]>(itemsQuery);
  if (itemsError) {
    throw new Error(
      `No se pudieron cargar los productos: ${itemsError.message}`
    );
  }

  return {
    customerId: request.customer_id,
    customerSegment: request.customer_segment,
    sellerZone: request.seller_zone_snapshot ?? "",
    currency: request.currency,
    exchangeRate: request.exchange_rate,
    priceLevelId: request.price_level_id,
    salesPriceListId: request.sales_price_list_id,
    paymentMethod: request.payment_method ?? "",
    paymentTerm: request.payment_term ?? "",
    invoiceType: request.invoice_type ?? "NOTA_DE_VENTA",
    observations: request.seller_observations ?? "",
    items: (items ?? []).map((item) => ({
      productId: item.product_id,
      productVariantId: item.product_variant_id,
      quantity: item.quantity,
      pricingMethod: item.pricing_method,
      competitorUnitPrice: item.competitor_unit_price,
      agreedUnitPrice: item.agreed_unit_price,
      discountPercentage: item.discount_percentage,
      comment: item.product_comment ?? "",
    })),
  };
}

export async function getOwnSalesQuoteRequestDetails(params: {
  orgSlug: string;
  userId: string;
  requestId: string;
}): Promise<SalesQuoteRequestDetail | null> {
  const organization = await getOrganizationBySlug(params.orgSlug);
  if (!organization?.id) {
    throw new Error("Organización no encontrada");
  }

  const database = createAdminClient() as unknown as DatabaseClient;
  const { data: rows, error } = await executeQuery<DetailRequestRow[]>(
    database
      .from("sales_quote_requests")
      .select(
        "id, customer_id, status, currency, created_at, seller_name_snapshot, seller_zone_snapshot, customer_segment, payment_method, payment_term, invoice_type, exchange_rate, seller_observations, review_comment, cancellation_observation, sales_order_id, subtotal_amount, tax_amount, total_amount"
      )
      .eq("id", params.requestId)
      .eq("organization_id", organization.id)
      .eq("created_by", params.userId)
  );
  if (error) {
    throw new Error(`No se pudo cargar la cotización: ${error.message}`);
  }
  const request = rows?.[0];
  if (!request) {
    return null;
  }

  const [customerResult, itemResult] = await Promise.all([
    executeQuery<DetailCustomerRow[]>(
      database
        .from("customers")
        .select("id, fantasy_name, business_name")
        .eq("id", request.customer_id)
    ),
    executeQuery<DetailItemRow[]>(
      database
        .from("sales_quote_request_items")
        .select(
          "id, request_id, product_name_snapshot, sku_snapshot, unit_of_measure_snapshot, quantity, pricing_method, base_unit_price, competitor_unit_price, agreed_unit_price, discount_percentage, line_subtotal, product_comment"
        )
        .eq("request_id", request.id)
        .order("line_number", { ascending: true })
    ),
  ]);
  if (customerResult.error) {
    throw new Error(
      `No se pudo cargar el cliente: ${customerResult.error.message}`
    );
  }
  if (itemResult.error) {
    throw new Error(
      `No se pudieron cargar los productos: ${itemResult.error.message}`
    );
  }

  const customer = customerResult.data?.[0];
  return {
    ...request,
    customer_name:
      customer?.fantasy_name || customer?.business_name || "Cliente",
    items: (itemResult.data ?? []).map(
      ({ request_id: _requestId, ...item }) => item
    ),
  };
}

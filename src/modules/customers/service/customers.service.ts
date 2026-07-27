import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { getSalesAccessContext } from "@/modules/sales/service/sales.service";
import { normalizeCustomerTaxCondition } from "../tax-conditions";
import type {
  Customer,
  CustomerMetrics,
  CustomerPaginatedParams,
  CustomerSale,
  CustomerWithStats,
  PaginatedResult,
} from "../types";

export type CustomerChannel = "DISTRIBUIDORA" | "POS" | "MIXTO";

const DEFAULT_CUSTOMER_CHANNEL: CustomerChannel = "DISTRIBUIDORA";
const VALID_CUSTOMER_CHANNELS: CustomerChannel[] = [
  "DISTRIBUIDORA",
  "POS",
  "MIXTO",
];

const normalizeCustomerChannel = (value?: string | null): CustomerChannel => {
  const normalized = value?.trim().toUpperCase();

  if (
    normalized &&
    VALID_CUSTOMER_CHANNELS.includes(normalized as CustomerChannel)
  ) {
    return normalized as CustomerChannel;
  }

  return DEFAULT_CUSTOMER_CHANNEL;
};

function canReadCustomers(permissions: string[]): boolean {
  return (
    permissions.includes("organization.admin") ||
    permissions.includes("clients.read") ||
    permissions.includes("customers.read")
  );
}

function canViewAllCustomers(permissions: string[]): boolean {
  return (
    permissions.includes("organization.admin") ||
    permissions.includes("clients.read.all") ||
    permissions.includes("customers.read.all") ||
    permissions.includes("sales.read.all") ||
    permissions.includes("sales.manage.all")
  );
}

export type CreateCustomerInput = {
  orgSlug: string;
  business_name: string;
  fantasy_name?: string;
  cuit?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  province?: string | null;
  delivery_address?: string | null;
  delivery_city?: string | null;
  credit_limit?: number;
  tax_condition?: string;
  client_number?: string;
  sales_price_list_id?: string | null;
  customer_channel?: CustomerChannel;
  assigned_seller_id?: string | null;
  preferred_carrier_id?: string | null;
  due_days?: number | null;
  is_active?: boolean;
};

export type UpdateCustomerInput = Partial<Omit<CreateCustomerInput, "orgSlug">>;
export type CustomerStatusFilter = "active" | "archived" | "all";

function normalizeTaxConditionInput(
  value: string | null | undefined
): string | null | undefined {
  if (value === undefined) {
    return;
  }

  if (value === null) {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const normalized = normalizeCustomerTaxCondition(trimmed);

  if (!normalized) {
    throw new Error(
      "Seleccioná una condición fiscal válida para este cliente."
    );
  }

  return normalized;
}

export async function getCustomersByOrgSlug(
  orgSlug: string,
  status: CustomerStatusFilter = "active"
): Promise<Customer[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  let query = supabase
    .from("customers")
    .select("*")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false });

  if (status === "active") {
    query = query.eq("is_active", true);
  }

  if (status === "archived") {
    query = query.eq("is_active", false);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Error fetching customers: ${error.message}`);
  }

  return data ?? [];
}

export async function getVisibleCustomersByOrgSlug(
  orgSlug: string,
  status: CustomerStatusFilter = "active"
): Promise<Customer[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();
  const accessContext = await getSalesAccessContext(orgSlug);
  const canRead = canReadCustomers(accessContext.permissions);
  const canViewAll = canViewAllCustomers(accessContext.permissions);

  if (!canRead) {
    return [];
  }

  let query = supabase
    .from("customers")
    .select("*")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false });

  if (status === "active") {
    query = query.eq("is_active", true);
  }

  if (status === "archived") {
    query = query.eq("is_active", false);
  }

  if (!canViewAll) {
    if (!accessContext.userId) {
      return [];
    }

    query = query.or(
      `assigned_seller_id.eq.${accessContext.userId},assigned_seller_id.is.null`
    );
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Error fetching customers: ${error.message}`);
  }

  return data ?? [];
}

export async function filterCustomersBySalesScope(
  orgSlug: string,
  customers: Customer[]
): Promise<Customer[]> {
  const accessContext = await getSalesAccessContext(orgSlug);
  const canRead = canReadCustomers(accessContext.permissions);
  const canViewAll = canViewAllCustomers(accessContext.permissions);

  if (!canRead) {
    return [];
  }

  if (canViewAll) {
    return customers;
  }

  if (!accessContext.userId) {
    return [];
  }

  return customers.filter(
    (customer) =>
      customer.assigned_seller_id === accessContext.userId ||
      customer.assigned_seller_id === null ||
      customer.assigned_seller_id === undefined
  );
}

export async function createCustomerForOrg(
  input: CreateCustomerInput
): Promise<Customer> {
  if (!input.business_name?.trim()) {
    throw new Error("La razón social del cliente es requerida");
  }

  const org = await getOrganizationBySlug(input.orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  // Check for duplicate CUIT within the same organization
  if (input.cuit?.trim()) {
    const { data: existing } = await supabase
      .from("customers")
      .select("id")
      .eq("organization_id", org.id)
      .eq("cuit", input.cuit.trim())
      .maybeSingle();

    if (existing) {
      throw new Error("Ya existe un cliente con ese CUIT");
    }
  }

  const sanitize = (value?: string | null) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  };
  const taxCondition = normalizeTaxConditionInput(input.tax_condition) ?? null;

  const { data, error } = await supabase
    .from("customers")
    .insert({
      organization_id: org.id,
      business_name: input.business_name.trim(),
      fantasy_name: sanitize(input.fantasy_name),
      cuit: sanitize(input.cuit),
      phone: sanitize(input.phone),
      email: sanitize(input.email),
      address: sanitize(input.address),
      city: sanitize(input.city),
      province: sanitize(input.province),
      delivery_address: sanitize(input.delivery_address),
      delivery_city: sanitize(input.delivery_city),
      credit_limit: input.credit_limit,
      tax_condition: taxCondition,
      client_number: sanitize(input.client_number),
      sales_price_list_id: input.sales_price_list_id || null,
      customer_channel: normalizeCustomerChannel(input.customer_channel),
      assigned_seller_id: input.assigned_seller_id || null,
      preferred_carrier_id: input.preferred_carrier_id || null,
      due_days: input.due_days ?? null,
      is_active: true,
    })
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo crear el cliente: ${error.message}`);
  }

  if (!data) {
    throw new Error("No se pudo crear el cliente");
  }

  return data;
}

/**
 * Gets a customer by ID.
 */
export async function getCustomerById(
  customerId: string
): Promise<Customer | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .maybeSingle();

  if (error) {
    throw new Error(`Error fetching customer: ${error.message}`);
  }

  return data;
}

const sanitizeString = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

function applyDirectCustomerUpdateFields(
  updateData: Record<string, unknown>,
  input: Partial<Omit<CreateCustomerInput, "orgSlug">>
) {
  if (input.business_name !== undefined) {
    updateData.business_name = input.business_name.trim();
  }
  if (input.credit_limit !== undefined) {
    updateData.credit_limit = input.credit_limit;
  }
  if (input.customer_channel !== undefined) {
    updateData.customer_channel = normalizeCustomerChannel(
      input.customer_channel
    );
  }
  if (input.tax_condition !== undefined) {
    updateData.tax_condition = normalizeTaxConditionInput(input.tax_condition);
  }
  if (input.is_active !== undefined) {
    updateData.is_active = input.is_active;
  }
}

function buildCustomerUpdateData(
  input: Partial<Omit<CreateCustomerInput, "orgSlug">>
): Record<string, unknown> {
  const updateData: Record<string, unknown> = {};

  applyDirectCustomerUpdateFields(updateData, input);

  const sanitizedFields = [
    "fantasy_name",
    "cuit",
    "phone",
    "email",
    "address",
    "city",
    "province",
    "delivery_address",
    "delivery_city",
    "client_number",
  ] as const;
  for (const field of sanitizedFields) {
    if (input[field] !== undefined) {
      updateData[field] = sanitizeString(input[field]);
    }
  }

  const nullableIdFields = [
    "sales_price_list_id",
    "assigned_seller_id",
    "preferred_carrier_id",
  ] as const;
  for (const field of nullableIdFields) {
    if (input[field] !== undefined) {
      updateData[field] = input[field] || null;
    }
  }

  if (input.due_days !== undefined) {
    updateData.due_days = input.due_days ?? null;
  }

  return updateData;
}

/**
 * Updates a customer by ID.
 */
export async function updateCustomerById(
  customerId: string,
  input: Partial<Omit<CreateCustomerInput, "orgSlug">>
): Promise<Customer> {
  // Only validate business_name if it's being updated
  if (input.business_name !== undefined && !input.business_name?.trim()) {
    throw new Error("La razón social del cliente es requerida");
  }

  const supabase = await createClient();
  const updateData = buildCustomerUpdateData(input);

  // Ensure we have something to update
  if (Object.keys(updateData).length === 0) {
    throw new Error("No hay datos para actualizar");
  }

  const { data, error } = await supabase
    .from("customers")
    .update(updateData)
    .eq("id", customerId)
    .select("*")
    .single();

  if (error) {
    // Error updating customer
    throw new Error(`No se pudo actualizar el cliente: ${error.message}`);
  }

  if (!data) {
    throw new Error("No se pudo actualizar el cliente - cliente no encontrado");
  }

  return data;
}

/**
 * Returns a customer with sales statistics and recent sales.
 */
export async function getCustomerWithStats(
  orgSlug: string,
  customerId: string
): Promise<CustomerWithStats | null> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  // Fetch customer
  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (customerError) {
    throw new Error(`Error obteniendo cliente: ${customerError.message}`);
  }

  if (!customer) {
    return null;
  }

  const accessContext = await getSalesAccessContext(orgSlug);
  const canRead = canReadCustomers(accessContext.permissions);
  const canViewAll = canViewAllCustomers(accessContext.permissions);

  if (!canRead) {
    return null;
  }

  if (
    !canViewAll &&
    (!accessContext.userId ||
      (customer.assigned_seller_id !== accessContext.userId &&
        customer.assigned_seller_id !== null))
  ) {
    return null;
  }

  // Fetch sales for this customer
  const { data: sales, error: salesError } = await supabase
    .from("sales_orders")
    .select(
      "id, sale_number, status, sale_date, total_amount, invoice_type, invoice_number"
    )
    .eq("customer_id", customerId)
    .eq("organization_id", org.id)
    .order("sale_date", { ascending: false });

  if (salesError) {
    throw new Error(
      `Error obteniendo ventas del cliente: ${salesError.message}`
    );
  }

  // Calculate stats
  const totalSales = sales?.length ?? 0;
  const totalAmount =
    sales?.reduce((sum, sale) => sum + (Number(sale.total_amount) || 0), 0) ??
    0;

  // Get recent sales (last 10)
  const recentSales: CustomerSale[] = (sales?.slice(0, 10) ?? []).map((s) => ({
    id: s.id,
    sale_number: s.sale_number,
    status: s.status,
    sale_date: s.sale_date,
    total_amount: Number(s.total_amount) || 0,
    invoice_type: s.invoice_type,
    invoice_number: s.invoice_number,
  }));

  return {
    ...customer,
    stats: {
      totalSales,
      totalAmount,
    },
    recentSales,
  };
}

export type CustomerActiveItems = {
  activeSales: Array<{
    id: string;
    sale_number: number | null;
    status: string;
    sale_date: string;
    total_amount: number;
    invoice_number: string | null;
  }>;
  pendingCollections: Array<{
    id: string;
    total_amount: number;
    pending_balance: number;
    due_date: string;
    sale_number: number | null;
    invoice_number: string | null;
  }>;
  hasActiveItems: boolean;
};

/**
 * Check if a customer has any active sales or pending collections.
 * This is used to determine if the customer can be archived.
 */
export async function getCustomerActiveItems(
  orgSlug: string,
  customerId: string
): Promise<CustomerActiveItems> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  // Fetch active sales (not cancelled or delivered)
  const { data: activeSales, error: salesError } = await supabase
    .from("sales_orders")
    .select("id, sale_number, status, sale_date, total_amount, invoice_number")
    .eq("customer_id", customerId)
    .eq("organization_id", org.id)
    .in("status", ["DRAFT", "CONFIRMED", "DISPATCH"])
    .order("sale_date", { ascending: false });

  if (salesError) {
    throw new Error(`Error obteniendo ventas activas: ${salesError.message}`);
  }

  // Fetch pending collections (receivables with pending balance)
  const { data: pendingCollections, error: collectionsError } = await supabase
    .from("accounts_receivable")
    .select(
      `
      id,
      total_amount,
      pending_balance,
      due_date,
      sales_order_id,
      sales_orders!inner(sale_number, invoice_number, status)
    `
    )
    .eq("customer_id", customerId)
    .eq("organization_id", org.id)
    .gt("pending_balance", 0)
    .in("status", ["PENDING", "PARTIALLY_PAID"])
    .neq("sales_orders.status", "CANCELLED")
    .order("due_date", { ascending: true });

  if (collectionsError) {
    throw new Error(
      `Error obteniendo cuentas por cobrar: ${collectionsError.message}`
    );
  }

  // Transform the data
  const activeSalesData = (activeSales ?? []).map((sale) => ({
    id: sale.id,
    sale_number: sale.sale_number,
    status: sale.status,
    sale_date: sale.sale_date,
    total_amount: Number(sale.total_amount) || 0,
    invoice_number: sale.invoice_number,
  }));

  const pendingCollectionsData = (pendingCollections ?? []).map(
    (collection) => ({
      id: collection.id,
      total_amount: Number(collection.total_amount) || 0,
      pending_balance: Number(collection.pending_balance) || 0,
      due_date: collection.due_date,
      sale_number: Array.isArray(collection.sales_orders)
        ? (collection.sales_orders[0]?.sale_number ?? null)
        : null,
      invoice_number: Array.isArray(collection.sales_orders)
        ? (collection.sales_orders[0]?.invoice_number ?? null)
        : null,
    })
  );

  return {
    activeSales: activeSalesData,
    pendingCollections: pendingCollectionsData,
    hasActiveItems:
      activeSalesData.length > 0 || pendingCollectionsData.length > 0,
  };
}

function buildCustomerQuery(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  accessContext: Awaited<ReturnType<typeof getSalesAccessContext>>,
  params: CustomerPaginatedParams
) {
  let query = supabase
    .from("customers")
    .select("*", { count: "exact" })
    .eq("organization_id", orgId);

  if (params.status === "active") {
    query = query.eq("is_active", true);
  } else if (params.status === "archived") {
    query = query.eq("is_active", false);
  }

  if (params.search) {
    query = query.or(
      `client_number.ilike.%${params.search}%,fantasy_name.ilike.%${params.search}%,business_name.ilike.%${params.search}%,cuit.ilike.%${params.search}%,city.ilike.%${params.search}%`
    );
  }

  if (params.sellerId) {
    query = query.eq("assigned_seller_id", params.sellerId);
  }

  if (!canViewAllCustomers(accessContext.permissions)) {
    if (!accessContext.userId) {
      return null;
    }

    query = query.or(
      `assigned_seller_id.eq.${accessContext.userId},assigned_seller_id.is.null`
    );
  }

  if (params.sort && params.sort.length > 0) {
    for (const s of params.sort) {
      query = query.order(s.id, { ascending: !s.desc });
    }
  } else {
    query = query.order("created_at", { ascending: false });
  }

  const from = (params.page - 1) * params.pageSize;
  const to = from + params.pageSize - 1;
  query = query.range(from, to);

  return query;
}

export async function getCustomersPaginated(
  orgSlug: string,
  params: CustomerPaginatedParams
): Promise<PaginatedResult<Customer>> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    return {
      data: [],
      totalCount: 0,
      page: params.page,
      pageSize: params.pageSize,
    };
  }

  const supabase = await createClient();
  const accessContext = await getSalesAccessContext(orgSlug);

  if (!canReadCustomers(accessContext.permissions)) {
    return {
      data: [],
      totalCount: 0,
      page: params.page,
      pageSize: params.pageSize,
    };
  }

  const query = buildCustomerQuery(supabase, org.id, accessContext, params);

  if (query === null) {
    return {
      data: [],
      totalCount: 0,
      page: params.page,
      pageSize: params.pageSize,
    };
  }

  const { data, error, count } = await query;

  if (error || !data) {
    return {
      data: [],
      totalCount: count ?? 0,
      page: params.page,
      pageSize: params.pageSize,
    };
  }

  return {
    data,
    totalCount: count ?? 0,
    page: params.page,
    pageSize: params.pageSize,
  };
}

export async function getCustomerMetrics(
  orgSlug: string
): Promise<CustomerMetrics> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    return { totalCustomers: 0, activeCustomers: 0, archivedCustomers: 0 };
  }

  const supabase = await createClient();

  const [{ count: total }, { count: active }, { count: archived }] =
    await Promise.all([
      supabase
        .from("customers")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", org.id),
      supabase
        .from("customers")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", org.id)
        .eq("is_active", true),
      supabase
        .from("customers")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", org.id)
        .eq("is_active", false),
    ]);

  return {
    totalCustomers: total ?? 0,
    activeCustomers: active ?? 0,
    archivedCustomers: archived ?? 0,
  };
}

export async function getAllCustomersForExport(
  orgSlug: string,
  filters?: { search?: string; status?: string; sellerId?: string }
): Promise<Customer[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    return [];
  }

  const supabase = await createClient();
  const accessContext = await getSalesAccessContext(orgSlug);
  const canRead = canReadCustomers(accessContext.permissions);
  const canViewAll = canViewAllCustomers(accessContext.permissions);

  if (!canRead) {
    return [];
  }

  let query = supabase
    .from("customers")
    .select("*")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false })
    .limit(10_000);

  if (filters?.status === "active") {
    query = query.eq("is_active", true);
  } else if (filters?.status === "archived") {
    query = query.eq("is_active", false);
  }

  if (filters?.search) {
    query = query.or(
      `client_number.ilike.%${filters.search}%,fantasy_name.ilike.%${filters.search}%,business_name.ilike.%${filters.search}%,cuit.ilike.%${filters.search}%,city.ilike.%${filters.search}%`
    );
  }

  if (filters?.sellerId) {
    query = query.eq("assigned_seller_id", filters.sellerId);
  }

  if (!canViewAll) {
    if (!accessContext.userId) {
      return [];
    }

    query = query.or(
      `assigned_seller_id.eq.${accessContext.userId},assigned_seller_id.is.null`
    );
  }

  const { data, error } = await query;

  if (error || !data) {
    return [];
  }

  return data;
}

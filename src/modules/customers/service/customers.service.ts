import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { Customer, CustomerSale, CustomerWithStats } from "../types";

export type CreateCustomerInput = {
  orgSlug: string;
  business_name: string;
  fantasy_name?: string;
  cuit?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  credit_limit?: number;
  tax_condition?: string;
  client_number?: string;
  sales_price_list_id?: string | null;
};

export type UpdateCustomerInput = Omit<CreateCustomerInput, "orgSlug">;

export async function getCustomersByOrgSlug(
  orgSlug: string
): Promise<Customer[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Error fetching customers: ${error.message}`);
  }

  return data ?? [];
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

  const sanitize = (value?: string | null) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  };

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
      credit_limit: input.credit_limit,
      tax_condition: sanitize(input.tax_condition),
      client_number: sanitize(input.client_number),
      sales_price_list_id: input.sales_price_list_id || null,
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

/**
 * Updates a customer by ID.
 */
export async function updateCustomerById(
  customerId: string,
  input: Omit<CreateCustomerInput, "orgSlug">
): Promise<Customer> {
  if (!input.business_name?.trim()) {
    throw new Error("La razón social del cliente es requerida");
  }

  const supabase = await createClient();

  const sanitize = (value?: string | null) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  };

  const { data, error } = await supabase
    .from("customers")
    .update({
      business_name: input.business_name.trim(),
      fantasy_name: sanitize(input.fantasy_name),
      cuit: sanitize(input.cuit),
      phone: sanitize(input.phone),
      email: sanitize(input.email),
      address: sanitize(input.address),
      city: sanitize(input.city),
      credit_limit: input.credit_limit,
      tax_condition: sanitize(input.tax_condition),
      client_number: sanitize(input.client_number),
      sales_price_list_id: input.sales_price_list_id || null,
    })
    .eq("id", customerId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo actualizar el cliente: ${error.message}`);
  }

  if (!data) {
    throw new Error("No se pudo actualizar el cliente");
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

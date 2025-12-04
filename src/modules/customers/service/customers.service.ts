import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { Customer } from "../types";

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
};

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

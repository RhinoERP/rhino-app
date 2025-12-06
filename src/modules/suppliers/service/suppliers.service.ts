import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { Database } from "@/types/supabase";

export type Supplier = Database["public"]["Tables"]["suppliers"]["Row"];
export type CreateSupplierInput = {
  orgSlug: string;
  name: string;
  cuit?: string;
  phone?: string;
  email?: string;
  address?: string;
  contact_name?: string;
  payment_terms?: string;
  notes?: string;
};
export type UpdateSupplierInput = CreateSupplierInput & {
  supplierId: string;
};

/**
 * Returns all suppliers that belong to the organization identified by the slug.
 */
export async function getSuppliersByOrgSlug(
  orgSlug: string
): Promise<Supplier[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("suppliers")
    .select("*")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Error fetching suppliers: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Returns a supplier by id, ensuring it belongs to the given organization slug.
 */
export async function getSupplierById(
  orgSlug: string,
  supplierId: string
): Promise<Supplier | null> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("suppliers")
    .select("*")
    .eq("id", supplierId)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (error) {
    throw new Error(`Error obteniendo proveedor: ${error.message}`);
  }

  return data ?? null;
}

/**
 * Updates an existing supplier that belongs to the given organization.
 */
export async function updateSupplierForOrg(
  input: UpdateSupplierInput
): Promise<Supplier> {
  if (!input.name?.trim()) {
    throw new Error("El nombre del proveedor es requerido");
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
    .from("suppliers")
    .update({
      name: input.name.trim(),
      cuit: sanitize(input.cuit),
      phone: sanitize(input.phone),
      email: sanitize(input.email),
      address: sanitize(input.address),
      contact_name: sanitize(input.contact_name),
      payment_terms: sanitize(input.payment_terms),
      notes: sanitize(input.notes),
    })
    .eq("id", input.supplierId)
    .eq("organization_id", org.id)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo actualizar el proveedor: ${error.message}`);
  }

  if (!data) {
    throw new Error("Proveedor no encontrado o no pertenece a la organización");
  }

  return data;
}

/**
 * Creates a new supplier for the given organization slug.
 */
export async function createSupplierForOrg(
  input: CreateSupplierInput
): Promise<Supplier> {
  if (!input.name?.trim()) {
    throw new Error("El nombre del proveedor es requerido");
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
    .from("suppliers")
    .insert({
      organization_id: org.id,
      name: input.name.trim(),
      cuit: sanitize(input.cuit),
      phone: sanitize(input.phone),
      email: sanitize(input.email),
      address: sanitize(input.address),
      contact_name: sanitize(input.contact_name),
      payment_terms: sanitize(input.payment_terms),
      notes: sanitize(input.notes),
    })
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo crear el proveedor: ${error.message}`);
  }

  if (!data) {
    throw new Error("No se pudo crear el proveedor");
  }

  return data;
}

/**
 * Deletes a supplier by id.
 */
export async function deleteSupplierById(supplierId: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("suppliers")
    .delete()
    .eq("id", supplierId);

  if (error) {
    throw new Error(`No se pudo eliminar el proveedor: ${error.message}`);
  }
}

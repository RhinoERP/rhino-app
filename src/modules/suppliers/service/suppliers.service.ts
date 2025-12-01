import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { Database } from "@/types/supabase";

export type Supplier = Database["public"]["Tables"]["suppliers"]["Row"];

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

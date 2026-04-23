import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { Database } from "@/types/supabase";

export type Carrier = Database["public"]["Tables"]["carriers"]["Row"];

export type CreateCarrierInput = {
  orgSlug: string;
  name: string;
  phone?: string | null;
  email?: string | null;
};

export type UpdateCarrierInput = {
  carrierId: string;
  name: string;
  phone?: string | null;
  email?: string | null;
};

export async function getActiveCarriersByOrgSlug(
  orgSlug: string
): Promise<Carrier[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("carriers")
    .select("*")
    .eq("organization_id", org.id)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Error al obtener transportes: ${error.message}`);
  }

  return data ?? [];
}

export async function getAllCarriersByOrgSlug(
  orgSlug: string
): Promise<Carrier[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("carriers")
    .select("*")
    .eq("organization_id", org.id)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Error al obtener transportes: ${error.message}`);
  }

  return data ?? [];
}

export async function createCarrierForOrg(
  input: CreateCarrierInput
): Promise<Carrier> {
  if (!input.name?.trim()) {
    throw new Error("El nombre del transporte es requerido");
  }

  const org = await getOrganizationBySlug(input.orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("carriers")
    .insert({
      organization_id: org.id,
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      is_active: true,
    })
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo crear el transporte: ${error.message}`);
  }

  if (!data) {
    throw new Error("No se pudo crear el transporte");
  }

  return data;
}

export async function updateCarrierById(
  input: UpdateCarrierInput
): Promise<Carrier> {
  if (!input.name?.trim()) {
    throw new Error("El nombre del transporte es requerido");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("carriers")
    .update({
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.carrierId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo actualizar el transporte: ${error.message}`);
  }

  if (!data) {
    throw new Error("No se pudo actualizar el transporte");
  }

  return data;
}

export async function deactivateCarrierById(carrierId: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("carriers")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", carrierId);

  if (error) {
    throw new Error(`No se pudo eliminar el transporte: ${error.message}`);
  }
}

import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type {
  CreatePriceLevelInput,
  PriceLevel,
  PriceLevelWithStatus,
  UpdatePriceLevelInput,
} from "../types";

function mapPriceLevelStatus(item: PriceLevel): PriceLevelWithStatus {
  const today = new Date().toISOString().split("T")[0];
  let status: "Active" | "Scheduled" | "Archived" = "Active";
  if (!item.is_active) {
    status = "Archived";
  } else if (item.valid_from && item.valid_from > today) {
    status = "Scheduled";
  }
  return { ...item, status };
}

export async function getPriceLevelsByOrgSlug(
  orgSlug: string
): Promise<PriceLevelWithStatus[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("price_levels")
    .select("*")
    .eq("organization_id", org.id)
    .order("margin", { ascending: true });

  if (error) {
    throw new Error(`Error obteniendo niveles de precio: ${error.message}`);
  }

  return (data ?? []).map(mapPriceLevelStatus);
}

export async function createPriceLevel(
  input: CreatePriceLevelInput
): Promise<PriceLevel> {
  const org = await getOrganizationBySlug(input.orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  if (!input.name?.trim()) {
    throw new Error("El nombre del nivel de precio es requerido");
  }

  if (typeof input.margin !== "number" || input.margin < 0) {
    throw new Error("El margen debe ser un número mayor o igual a 0");
  }

  const supabase = await createClient();

  const insertPayload = {
    organization_id: org.id,
    name: input.name.trim(),
    margin: input.margin,
    valid_from: input.validFrom ?? null,
    is_active: input.isActive ?? true,
    ...(input.extraCommissionRate != null
      ? { extra_commission_rate: input.extraCommissionRate }
      : {}),
  };

  const { data, error } = await supabase
    .from("price_levels")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Error creando nivel de precio: ${error.message}`);
  }

  if (!data) {
    throw new Error("No se pudo crear el nivel de precio");
  }

  return data;
}

export async function updatePriceLevel(
  orgSlug: string,
  priceLevelId: string,
  input: UpdatePriceLevelInput
): Promise<PriceLevel> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  if (!input.name?.trim()) {
    throw new Error("El nombre del nivel de precio es requerido");
  }

  if (typeof input.margin !== "number" || input.margin < 0) {
    throw new Error("El margen debe ser un número mayor o igual a 0");
  }

  const supabase = await createClient();

  const updatePayload = {
    name: input.name.trim(),
    margin: input.margin,
    valid_from: input.validFrom ?? null,
    is_active: input.isActive ?? true,
    updated_at: new Date().toISOString(),
    ...(input.extraCommissionRate != null
      ? { extra_commission_rate: input.extraCommissionRate }
      : {}),
  };

  const { data, error } = await supabase
    .from("price_levels")
    .update(updatePayload)
    .eq("id", priceLevelId)
    .eq("organization_id", org.id)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Error actualizando nivel de precio: ${error.message}`);
  }

  if (!data) {
    throw new Error("Nivel de precio no encontrado");
  }

  return data;
}

export async function deletePriceLevel(
  orgSlug: string,
  priceLevelId: string
): Promise<void> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("price_levels")
    .delete()
    .eq("id", priceLevelId)
    .eq("organization_id", org.id);

  if (error) {
    throw new Error(`Error eliminando nivel de precio: ${error.message}`);
  }
}

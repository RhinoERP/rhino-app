import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type {
  CreateSalesPriceListInput,
  SalesPriceList,
  SalesPriceListType,
  UpdateSalesPriceListInput,
} from "../types";

type SalesPriceListRow = {
  id: string;
  name: string;
  valid_from: string;
  notes: string | null;
  organization_id: string;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  percentage?: number | null;
  type?: SalesPriceListType | null;
  value?: number | null;
};

function getPriceListTypeAndValue(priceList: {
  percentage?: number | null;
  type?: SalesPriceListType | null;
  value?: number | null;
}): { type: SalesPriceListType; value: number } {
  const resolvedType = priceList.type ?? "PERCENTAGE";
  const resolvedValue =
    typeof priceList.value === "number"
      ? priceList.value
      : (priceList.percentage ?? 0);

  return {
    type: resolvedType,
    value: resolvedValue,
  };
}

function mapSalesPriceListRow(item: SalesPriceListRow): SalesPriceList {
  const today = new Date().toISOString().split("T")[0];
  let status: "Active" | "Scheduled" | "Archived" = "Active";
  if (!item.is_active) {
    status = "Archived";
  } else if (item.valid_from > today) {
    status = "Scheduled";
  }

  const { type, value } = getPriceListTypeAndValue(item);

  return {
    ...item,
    percentage: item.percentage ?? value,
    type,
    value,
    is_active: item.is_active ?? true,
    status,
  };
}

/**
 * Returns all sales price lists that belong to the organization identified by the slug.
 */
export async function getSalesPriceListsByOrgSlug(
  orgSlug: string
): Promise<SalesPriceList[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sales_price_lists")
    .select("*")
    .eq("organization_id", org.id)
    .order("valid_from", { ascending: false });

  if (error) {
    throw new Error(
      `Error obteniendo listas de precios de venta: ${error.message}`
    );
  }

  const priceLists: SalesPriceList[] = (data ?? []).map((item) =>
    mapSalesPriceListRow(item as SalesPriceListRow)
  );

  return priceLists;
}

/**
 * Returns a sales price list by ID.
 */
export async function getSalesPriceListById(
  orgSlug: string,
  priceListId: string
): Promise<SalesPriceList | null> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sales_price_lists")
    .select("*")
    .eq("id", priceListId)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Error obteniendo lista de precios de venta: ${error.message}`
    );
  }

  if (!data) {
    return null;
  }

  return mapSalesPriceListRow(data as SalesPriceListRow);
}

/**
 * Creates a new sales price list.
 */
export async function createSalesPriceList(
  input: CreateSalesPriceListInput
): Promise<SalesPriceList> {
  const org = await getOrganizationBySlug(input.orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  if (!input.name?.trim()) {
    throw new Error("El nombre de la lista de precios es requerido");
  }

  if (typeof input.value !== "number") {
    throw new Error("El valor de la lista debe ser un número");
  }

  if (input.type === "PERCENTAGE" && input.value < -100) {
    throw new Error("El porcentaje no puede ser menor a -100%");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sales_price_lists")
    .insert({
      organization_id: org.id,
      name: input.name.trim(),
      type: input.type,
      value: input.value,
      percentage: input.type === "PERCENTAGE" ? input.value : 0,
      valid_from: input.valid_from,
      is_active: input.is_active ?? true,
      notes: input.notes?.trim() || null,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `Error creando lista de precios de venta: ${error.message}`
    );
  }

  if (!data) {
    throw new Error("No se pudo crear la lista de precios de venta");
  }

  return mapSalesPriceListRow(data as SalesPriceListRow);
}

/**
 * Updates a sales price list.
 */
export async function updateSalesPriceList(
  orgSlug: string,
  priceListId: string,
  input: UpdateSalesPriceListInput
): Promise<SalesPriceList> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  if (!input.name?.trim()) {
    throw new Error("El nombre de la lista de precios es requerido");
  }

  if (typeof input.value !== "number") {
    throw new Error("El valor de la lista debe ser un número");
  }

  if (input.type === "PERCENTAGE" && input.value < -100) {
    throw new Error("El porcentaje no puede ser menor a -100%");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sales_price_lists")
    .update({
      name: input.name.trim(),
      type: input.type,
      value: input.value,
      percentage: input.type === "PERCENTAGE" ? input.value : 0,
      valid_from: input.valid_from,
      is_active: input.is_active ?? true,
      notes: input.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", priceListId)
    .eq("organization_id", org.id)
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `Error actualizando lista de precios de venta: ${error.message}`
    );
  }

  if (!data) {
    throw new Error("Lista de precios de venta no encontrada");
  }

  return mapSalesPriceListRow(data as SalesPriceListRow);
}

/**
 * Deletes a sales price list by ID.
 */
export async function deleteSalesPriceList(
  orgSlug: string,
  priceListId: string
): Promise<void> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("sales_price_lists")
    .delete()
    .eq("id", priceListId)
    .eq("organization_id", org.id);

  if (error) {
    throw new Error(
      `Error eliminando lista de precios de venta: ${error.message}`
    );
  }
}

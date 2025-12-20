import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type {
  ImportPriceListItem,
  ImportPriceListResult,
  PriceList,
  PriceListItem,
} from "../types";

export type CreatePriceListInput = {
  orgSlug: string;
  supplier_id: string;
  name: string;
  valid_from: string;
  items: ImportPriceListItem[];
  notes?: string | null;
};

/**
 * Returns all price lists that belong to the organization identified by the slug.
 */
export async function getPriceListsByOrgSlug(
  orgSlug: string
): Promise<PriceList[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("price_lists_with_status")
    .select(
      `
      id,
      name,
      supplier_id,
      valid_from,
      status,
      supplier:suppliers!inner(name, organization_id)
    `
    )
    .eq("supplier.organization_id", org.id)
    .order("valid_from", { ascending: false });

  if (error) {
    throw new Error(`Error fetching price lists: ${error.message}`);
  }

  // Transform the data to include supplier_name
  const priceLists = (data ?? []).map((item: unknown) => ({
    ...(item as Record<string, unknown>),
    supplier_name: (item as { supplier?: { name?: string } }).supplier?.name,
  })) as PriceList[];

  return priceLists;
}

/**
 * Imports a price list by calling the import_price_list RPC function.
 */
export async function importPriceList(
  input: CreatePriceListInput
): Promise<ImportPriceListResult> {
  const org = await getOrganizationBySlug(input.orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  if (!input.name?.trim()) {
    throw new Error("El nombre de la lista de precios es requerido");
  }

  if (!input.supplier_id) {
    throw new Error("El proveedor es requerido");
  }

  if (!input.items || input.items.length === 0) {
    throw new Error("Debe proporcionar al menos un item en el archivo");
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("import_price_list", {
    p_organization_id: org.id,
    p_supplier_id: input.supplier_id,
    p_name: input.name,
    p_valid_from: input.valid_from,
    p_items: input.items,
    p_notes: input.notes ?? undefined,
  });

  if (error) {
    throw new Error(`Error importando lista de precios: ${error.message}`);
  }

  if (!data) {
    throw new Error("No se pudo importar la lista de precios");
  }

  return data as ImportPriceListResult;
}

/**
 * Gets a price list by ID, ensuring it belongs to the given organization.
 */
export async function getPriceListById(
  orgSlug: string,
  priceListId: string
): Promise<PriceList | null> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  // Fetch from the view for status
  const { data: viewData, error: viewError } = await supabase
    .from("price_lists_with_status")
    .select(
      `
      id,
      name,
      supplier_id,
      valid_from,
      status,
      supplier:suppliers!inner(name, organization_id)
    `
    )
    .eq("id", priceListId)
    .eq("supplier.organization_id", org.id)
    .maybeSingle();

  if (viewError) {
    throw new Error(`Error obteniendo lista de precios: ${viewError.message}`);
  }

  if (!viewData) {
    return null;
  }

  // Fetch additional metadata from base table
  const { data: metaData } = await supabase
    .from("price_lists")
    .select("created_at, updated_at")
    .eq("id", priceListId)
    .maybeSingle();

  const result: PriceList = {
    ...(viewData as Record<string, unknown>),
    supplier_name: (viewData as { supplier?: { name?: string } }).supplier
      ?.name,
    created_at: metaData?.created_at,
    updated_at: metaData?.updated_at,
  } as PriceList;

  return result;
}

export async function getPriceListItems(
  orgSlug: string,
  priceListId: string
): Promise<PriceListItem[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("price_list_items")
    .select(
      `
      *,
      product:products(name, sku)
    `
    )
    .eq("price_list_id", priceListId);

  if (error) {
    throw new Error(
      `Error obteniendo items de la lista de precios: ${error.message}`
    );
  }

  const items = (data ?? []).map((item: unknown) => ({
    ...(item as Record<string, unknown>),
    product_name: (item as { product?: { name?: string } }).product?.name,
    sku: (item as { product?: { sku?: string } }).product?.sku,
    price: (item as { cost_price?: number }).cost_price,
  })) as PriceListItem[];

  return items;
}

import { truncateMoney } from "@/lib/decimal";
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
  extra_commission_rate?: number | null;
  is_target_margin?: boolean | null;
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
    extra_commission_rate: item.extra_commission_rate ?? null,
    is_target_margin: item.is_target_margin ?? false,
  };
}

function applySalesPriceListValue(
  basePrice: number,
  type: SalesPriceListType,
  value: number,
  opts: { isTargetMargin?: boolean; costPrice?: number } = {}
): number {
  if (opts.isTargetMargin && opts.costPrice !== undefined) {
    return truncateMoney(opts.costPrice * (1 + value / 100));
  }

  if (type === "PRICE") {
    return truncateMoney(Math.max(0, basePrice + value));
  }

  return truncateMoney(basePrice * (1 + value / 100));
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
      extra_commission_rate: input.extraCommissionRate ?? 0,
      is_target_margin: input.isTargetMargin ?? false,
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
      extra_commission_rate: input.extraCommissionRate ?? 0,
      is_target_margin: input.isTargetMargin ?? false,
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

/**
 * Calculates the sale price for a product based on the customer's price list.
 * Returns the base price if the customer has no price list assigned.
 */
export async function getProductSalePrice(
  orgSlug: string,
  productId: string,
  customerId: string | null
): Promise<number> {
  if (!customerId) {
    // If no customer, return base price
    const org = await getOrganizationBySlug(orgSlug);
    if (!org?.id) {
      throw new Error("Organización no encontrada");
    }

    const supabase = await createClient();
    const { data: productData } = await supabase
      .from("products_with_price")
      .select("calculated_sale_price")
      .eq("id", productId)
      .maybeSingle();

    return productData?.calculated_sale_price ?? 0;
  }

  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  // Get customer and their price list
  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("sales_price_list_id")
    .eq("id", customerId)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (customerError) {
    throw new Error(`Error obteniendo cliente: ${customerError.message}`);
  }

  if (!customer?.sales_price_list_id) {
    // No price list assigned, return base price
    const { data: productData } = await supabase
      .from("products_with_price")
      .select("calculated_sale_price")
      .eq("id", productId)
      .maybeSingle();

    return productData?.calculated_sale_price ?? 0;
  }

  // Get the price list
  const { data: priceList, error: priceListError } = await supabase
    .from("sales_price_lists")
    .select("percentage, type, value, is_active, valid_from")
    .eq("id", customer.sales_price_list_id)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (priceListError) {
    throw new Error(
      `Error obteniendo lista de precios: ${priceListError.message}`
    );
  }

  if (!priceList?.is_active) {
    // Price list is not active, return base price
    const { data: productData } = await supabase
      .from("products_with_price")
      .select("calculated_sale_price")
      .eq("id", productId)
      .maybeSingle();

    return productData?.calculated_sale_price ?? 0;
  }

  // Check if price list is valid (valid_from <= today)
  const today = new Date().toISOString().split("T")[0];
  if (priceList.valid_from > today) {
    // Price list is scheduled for future, return base price
    const { data: productData } = await supabase
      .from("products_with_price")
      .select("calculated_sale_price")
      .eq("id", productId)
      .maybeSingle();

    return productData?.calculated_sale_price ?? 0;
  }

  // Get base product price
  const { data: baseProduct, error: productError } = await supabase
    .from("products_with_price")
    .select("calculated_sale_price")
    .eq("id", productId)
    .maybeSingle();

  if (productError) {
    throw new Error(`Error obteniendo producto: ${productError.message}`);
  }

  if (!baseProduct?.calculated_sale_price) {
    return 0;
  }

  const basePrice = baseProduct.calculated_sale_price;
  const { type, value } = getPriceListTypeAndValue(priceList);
  const adjustedPrice = applySalesPriceListValue(basePrice, type, value);

  return adjustedPrice;
}

import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type {
  CreateSalesPriceListInput,
  SalesPriceList,
  UpdateSalesPriceListInput,
} from "../types";

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

  // Calculate status based on valid_from and is_active
  const today = new Date().toISOString().split("T")[0];

  const priceLists: SalesPriceList[] = (data ?? []).map((item) => {
    let status: "Active" | "Scheduled" | "Archived" = "Active";
    if (!item.is_active) {
      status = "Archived";
    } else if (item.valid_from > today) {
      status = "Scheduled";
    }

    return {
      ...item,
      is_active: item.is_active ?? true,
      status,
    };
  });

  return priceLists;
}

/**
 * Gets a sales price list by ID, ensuring it belongs to the given organization.
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

  const today = new Date().toISOString().split("T")[0];
  let status: "Active" | "Scheduled" | "Archived" = "Active";
  if (!data.is_active) {
    status = "Archived";
  } else if (data.valid_from > today) {
    status = "Scheduled";
  }

  return {
    ...data,
    is_active: data.is_active ?? true,
    status,
  };
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

  if (typeof input.percentage !== "number") {
    throw new Error("El porcentaje debe ser un número");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sales_price_lists")
    .insert({
      organization_id: org.id,
      name: input.name.trim(),
      percentage: input.percentage,
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

  const today = new Date().toISOString().split("T")[0];
  let status: "Active" | "Scheduled" | "Archived" = "Active";
  if (!data.is_active) {
    status = "Archived";
  } else if (data.valid_from > today) {
    status = "Scheduled";
  }

  return {
    ...data,
    is_active: data.is_active ?? true,
    status,
  };
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

  if (typeof input.percentage !== "number") {
    throw new Error("El porcentaje debe ser un número");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sales_price_lists")
    .update({
      name: input.name.trim(),
      percentage: input.percentage,
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

  const today = new Date().toISOString().split("T")[0];
  let status: "Active" | "Scheduled" | "Archived" = "Active";
  if (!data.is_active) {
    status = "Archived";
  } else if (data.valid_from > today) {
    status = "Scheduled";
  }

  return {
    ...data,
    is_active: data.is_active ?? true,
    status,
  };
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
    const { data: baseProduct } = await supabase
      .from("products_with_price")
      .select("calculated_sale_price")
      .eq("id", productId)
      .maybeSingle();

    return baseProduct?.calculated_sale_price ?? 0;
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
    const { data: baseProduct } = await supabase
      .from("products_with_price")
      .select("calculated_sale_price")
      .eq("id", productId)
      .maybeSingle();

    return baseProduct?.calculated_sale_price ?? 0;
  }

  // Get the price list
  const { data: priceList, error: priceListError } = await supabase
    .from("sales_price_lists")
    .select("percentage, is_active, valid_from")
    .eq("id", customer.sales_price_list_id)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (priceListError) {
    throw new Error(
      `Error obteniendo lista de precios: ${priceListError.message}`
    );
  }

  if (!priceList?.is_active) {
    // Price list not found or inactive, return base price
    const { data: baseProduct } = await supabase
      .from("products_with_price")
      .select("calculated_sale_price")
      .eq("id", productId)
      .maybeSingle();

    return baseProduct?.calculated_sale_price ?? 0;
  }

  // Check if price list is valid (valid_from <= today)
  const today = new Date().toISOString().split("T")[0];
  if (priceList.valid_from > today) {
    // Price list not yet valid, return base price
    const { data: baseProduct } = await supabase
      .from("products_with_price")
      .select("calculated_sale_price")
      .eq("id", productId)
      .maybeSingle();

    return baseProduct?.calculated_sale_price ?? 0;
  }

  // Get base price
  const { data: product, error: productError } = await supabase
    .from("products_with_price")
    .select("calculated_sale_price")
    .eq("id", productId)
    .maybeSingle();

  if (productError) {
    throw new Error(`Error obteniendo producto: ${productError.message}`);
  }

  const basePrice = product?.calculated_sale_price ?? 0;

  // Apply percentage: precio_final = precio_base * (1 + percentage / 100)
  const finalPrice = basePrice * (1 + priceList.percentage / 100);

  // Round to 2 decimal places
  return Math.round(finalPrice * 100) / 100;
}

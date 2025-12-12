import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { Database } from "@/types/supabase";
import type { Product, StockFilters, StockItem } from "../types";

export type CreateProductInput = {
  orgSlug: string;
  name: string;
  sku: string;
  description?: string;
  brand?: string;
  cost_price: number;
  sale_price: number;
  category_id?: string;
  supplier_id?: string;
  unit_of_measure: Database["public"]["Enums"]["unit_of_measure_type"];
  units_per_box?: number;
  boxes_per_pallet?: number;
  weight_per_unit?: number;
  image_url?: string;
};

/**
 * Creates a new product in the organization.
 */
export async function createProductForOrg(
  input: CreateProductInput
): Promise<Product> {
  const {
    orgSlug,
    name,
    sku,
    description,
    brand,
    cost_price,
    sale_price,
    category_id,
    supplier_id,
    unit_of_measure,
    units_per_box,
    boxes_per_pallet,
    weight_per_unit,
    image_url,
  } = input;

  if (!name?.trim()) {
    throw new Error("El nombre del producto es requerido");
  }

  if (!sku?.trim()) {
    throw new Error("El SKU es requerido");
  }

  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const sanitize = (value?: string | null) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  };

  // Create the product
  const { data, error } = await supabase
    .from("products")
    .insert({
      organization_id: org.id,
      name: name.trim(),
      sku: sku.trim(),
      description: sanitize(description),
      brand: sanitize(brand),
      cost_price,
      sale_price,
      category_id: category_id || null,
      supplier_id: supplier_id || null,
      unit_of_measure,
      units_per_box: units_per_box || null,
      boxes_per_pallet: boxes_per_pallet || null,
      weight_per_unit: weight_per_unit || null,
      image_url: sanitize(image_url),
      is_active: true,
    })
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo crear el producto: ${error.message}`);
  }

  if (!data) {
    throw new Error("No se pudo crear el producto");
  }

  return data;
}

/**
 * Gets aggregated stock summary for all products in an organization.
 * Joins product data with summed product_lots quantities.
 */
export async function getStockSummary(
  orgSlug: string,
  filters: StockFilters = {}
): Promise<StockItem[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  // Build query to get products with aggregated stock
  let query = supabase
    .from("products")
    .select(
      `
      id,
      sku,
      name,
      image_url,
      brand,
      is_active,
      sale_price,
      profit_margin,
      categories!products_category_id_fkey(name),
      suppliers!products_supplier_id_fkey(name)
    `
    )
    .eq("organization_id", org.id);

  // Apply filters
  if (filters.query) {
    query = query.or(
      `sku.ilike.%${filters.query}%,name.ilike.%${filters.query}%`
    );
  }

  if (filters.brand) {
    query = query.eq("brand", filters.brand);
  }

  if (filters.supplier) {
    query = query.eq("suppliers.name", filters.supplier);
  }

  if (filters.category) {
    query = query.eq("categories.name", filters.category);
  }

  if (filters.status === "active") {
    query = query.eq("is_active", true);
  } else if (filters.status === "inactive") {
    query = query.eq("is_active", false);
  }

  query = query.order("name");

  const { data: products, error: productsError } = await query;

  if (productsError) {
    throw new Error(`Error fetching products: ${productsError.message}`);
  }

  if (!products || products.length === 0) {
    return [];
  }

  // Get product IDs to fetch lot quantities
  const productIds = products.map((p) => p.id);

  // Fetch aggregated quantities from product_lots
  const { data: lots, error: lotsError } = await supabase
    .from("product_lots")
    .select("product_id, quantity_available")
    .eq("organization_id", org.id)
    .in("product_id", productIds);

  if (lotsError) {
    throw new Error(`Error fetching product lots: ${lotsError.message}`);
  }

  // Aggregate quantities by product_id
  const stockByProduct = new Map<string, number>();
  for (const lot of lots ?? []) {
    const current = stockByProduct.get(lot.product_id) ?? 0;
    stockByProduct.set(lot.product_id, current + lot.quantity_available);
  }

  // Map to StockItem format
  const stockItems: StockItem[] = products.map((product) => ({
    product_id: product.id,
    sku: product.sku,
    product_name: product.name,
    image_url: product.image_url,
    category_name:
      product.categories &&
      typeof product.categories === "object" &&
      "name" in product.categories
        ? (product.categories.name as string)
        : null,
    brand: product.brand,
    supplier_name:
      product.suppliers &&
      typeof product.suppliers === "object" &&
      "name" in product.suppliers
        ? (product.suppliers.name as string)
        : null,
    total_stock: stockByProduct.get(product.id) ?? 0,
    is_active: product.is_active ?? true,
    sale_price:
      (product as unknown as { sale_price?: number }).sale_price ?? null,
    profit_margin:
      (product as unknown as { profit_margin?: number }).profit_margin ?? null,
  }));

  return stockItems;
}

/**
 * Gets unique suppliers for filter options.
 */
export async function getSuppliers(
  orgSlug: string
): Promise<Array<{ id: string; name: string }>> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("organization_id", org.id)
    .eq("is_active", true)
    .order("name");

  if (error) {
    throw new Error(`Error fetching suppliers: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Gets unique brands for filter options.
 */
export async function getBrands(orgSlug: string): Promise<string[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("products")
    .select("brand")
    .eq("organization_id", org.id)
    .not("brand", "is", null)
    .order("brand");

  if (error) {
    throw new Error(`Error fetching brands: ${error.message}`);
  }

  const uniqueBrands = [
    ...new Set(data?.map((p) => p.brand).filter((b): b is string => !!b)),
  ];

  return uniqueBrands;
}

/**
 * Gets categories for filter options.
 */
export async function getCategories(
  orgSlug: string
): Promise<Array<{ id: string; name: string }>> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("categories")
    .select("id, name")
    .eq("organization_id", org.id)
    .order("name");

  if (error) {
    throw new Error(`Error fetching categories: ${error.message}`);
  }

  return data ?? [];
}

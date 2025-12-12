import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { Database } from "@/types/supabase";
import type {
  Product,
  ProductDetail,
  ProductLotWithStatus,
  StockFilters,
  StockItem,
  StockMovementType,
  StockMovementWithLot,
} from "../types";

type ProductWithRelations = Database["public"]["Tables"]["products"]["Row"] & {
  categories?: { id: string; name: string } | null;
  suppliers?: { id: string; name: string } | null;
};

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

export type UpdateProductInput = Omit<CreateProductInput, "orgSlug"> & {
  orgSlug: string;
  productId: string;
  is_active?: boolean;
};

/**
 * Updates an existing product within the organization.
 */
export async function updateProductForOrg(
  input: UpdateProductInput
): Promise<Product> {
  const {
    orgSlug,
    productId,
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
    is_active,
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

  const { data, error } = await supabase
    .from("products")
    .update({
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
      ...(typeof is_active === "boolean" ? { is_active } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", productId)
    .eq("organization_id", org.id)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo actualizar el producto: ${error.message}`);
  }

  if (!data) {
    throw new Error("No se pudo actualizar el producto");
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

const addLotStatus = (
  lot: Database["public"]["Tables"]["product_lots"]["Row"]
): ProductLotWithStatus => {
  const today = new Date();
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );
  const expirationDate = lot.expiration_date
    ? new Date(lot.expiration_date)
    : null;

  const expiresInDays = expirationDate
    ? Math.ceil(
        (expirationDate.getTime() - todayStart.getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : null;

  const isExpired =
    expirationDate !== null && expirationDate.getTime() < todayStart.getTime();

  return {
    ...lot,
    isExpired,
    expiresInDays,
  };
};

/**
 * Gets full product detail including category, supplier and aggregated stock.
 */
export async function getProductDetail(
  orgSlug: string,
  productId: string
): Promise<ProductDetail | null> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data: product, error } = await supabase
    .from("products")
    .select(
      `
        *,
        categories!products_category_id_fkey ( id, name ),
        suppliers!products_supplier_id_fkey ( id, name )
      `
    )
    .eq("organization_id", org.id)
    .eq("id", productId)
    .maybeSingle<ProductWithRelations>();

  if (error) {
    throw new Error(`Error fetching product: ${error.message}`);
  }

  if (!product) {
    return null;
  }

  const { data: lotStock, error: lotError } = await supabase
    .from("product_lots")
    .select("quantity_available")
    .eq("organization_id", org.id)
    .eq("product_id", productId);

  if (lotError) {
    throw new Error(`Error fetching stock: ${lotError.message}`);
  }

  const totalStock =
    lotStock?.reduce((acc, lot) => acc + (lot.quantity_available ?? 0), 0) ?? 0;

  const category =
    product.categories && typeof product.categories === "object"
      ? {
          id: (product.categories as { id: string; name: string }).id,
          name: (product.categories as { id: string; name: string }).name,
        }
      : null;

  const supplier =
    product.suppliers && typeof product.suppliers === "object"
      ? {
          id: (product.suppliers as { id: string; name: string }).id,
          name: (product.suppliers as { id: string; name: string }).name,
        }
      : null;

  return {
    product,
    category,
    supplier,
    totalStock,
  };
}

/**
 * Returns all lots for a product, enriched with expiration status.
 */
export async function getProductLots(
  orgSlug: string,
  productId: string
): Promise<ProductLotWithStatus[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("product_lots")
    .select("*")
    .eq("organization_id", org.id)
    .eq("product_id", productId)
    .order("expiration_date", { ascending: true });

  if (error) {
    throw new Error(`Error fetching product lots: ${error.message}`);
  }

  return (data ?? []).map(addLotStatus);
}

/**
 * Gets stock movements for a product, ordered by newest first.
 */
export async function getStockMovementsForProduct(
  orgSlug: string,
  productId: string,
  limit = 30
): Promise<StockMovementWithLot[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("stock_movements")
    .select(
      `
        id,
        lot_id,
        type,
        quantity,
        previous_stock,
        new_stock,
        reason,
        created_at,
        product_lots:lot_id (
          id,
          lot_number,
          expiration_date,
          product_id
        )
      `
    )
    .eq("organization_id", org.id)
    .eq("product_lots.product_id", productId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Error fetching stock movements: ${error.message}`);
  }

  return (data ?? [])
    .filter((movement) => movement.product_lots)
    .map((movement) => ({
      id: movement.id,
      lot_id: movement.product_lots?.id ?? movement.lot_id,
      lot_number: movement.product_lots?.lot_number ?? "-",
      lot_expiration_date: movement.product_lots?.expiration_date ?? null,
      type: movement.type,
      quantity: movement.quantity,
      previous_stock: movement.previous_stock,
      new_stock: movement.new_stock,
      reason: movement.reason,
      created_at: movement.created_at,
    }));
}

export type CreateProductLotInput = {
  orgSlug: string;
  productId: string;
  lotNumber: string;
  expirationDate: string | null;
  quantity: number;
};

/**
 * Creates a lot for a product.
 */
export async function createProductLotForOrg(
  input: CreateProductLotInput
): Promise<ProductLotWithStatus> {
  const { orgSlug, productId, lotNumber, expirationDate, quantity } = input;

  if (!lotNumber?.trim()) {
    throw new Error("El número de lote es requerido");
  }

  if (expirationDate) {
    const parsed = new Date(expirationDate);
    const year = parsed.getFullYear();
    if (Number.isNaN(parsed.getTime()) || year < 1900 || year > 2100) {
      throw new Error("La fecha de vencimiento no es válida");
    }
  }

  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, organization_id")
    .eq("id", productId)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (productError) {
    throw new Error(`Error validando el producto: ${productError.message}`);
  }

  if (!product) {
    throw new Error("Producto no encontrado para esta organización");
  }

  const sanitizedQuantity =
    Number.isFinite(quantity) && quantity > 0 ? quantity : 0;

  const resolvedExpiration =
    expirationDate ?? new Date("2100-12-31").toISOString().slice(0, 10); // fallback para "sin fecha"

  const { data, error } = await supabase
    .from("product_lots")
    .insert({
      organization_id: org.id,
      product_id: productId,
      lot_number: lotNumber.trim(),
      expiration_date: resolvedExpiration,
      quantity_available: sanitizedQuantity,
    })
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo crear el lote: ${error.message}`);
  }

  if (!data) {
    throw new Error("No se pudo crear el lote");
  }

  return addLotStatus(data);
}

export type CreateStockMovementInput = {
  orgSlug: string;
  productId: string;
  lotId: string;
  type: StockMovementType;
  quantity: number;
  reason?: string | null;
};

/**
 * Applies a stock movement to a lot and records it.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: validation and business rules in one place improve clarity
export async function createStockMovementForOrg(
  input: CreateStockMovementInput
) {
  const { orgSlug, productId, lotId, type, quantity, reason } = input;

  if (!lotId) {
    throw new Error("El lote es requerido");
  }

  const normalizedQuantity = Number.isFinite(quantity) ? quantity : 0;

  if ((type === "INBOUND" || type === "OUTBOUND") && normalizedQuantity <= 0) {
    throw new Error("La cantidad debe ser mayor a 0");
  }

  if (normalizedQuantity < 0) {
    throw new Error("La cantidad no puede ser negativa");
  }

  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data: lot, error: lotError } = await supabase
    .from("product_lots")
    .select("id, product_id, organization_id, quantity_available")
    .eq("id", lotId)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (lotError) {
    throw new Error(`Error obteniendo el lote: ${lotError.message}`);
  }

  if (!lot) {
    throw new Error("Lote no encontrado");
  }

  if (lot.product_id !== productId) {
    throw new Error("El lote no pertenece al producto seleccionado");
  }

  const previousStock = lot.quantity_available ?? 0;
  let newStock = previousStock;

  switch (type) {
    case "INBOUND": {
      newStock = previousStock + normalizedQuantity;
      break;
    }
    case "OUTBOUND": {
      if (normalizedQuantity > previousStock) {
        throw new Error("No hay stock suficiente en el lote");
      }
      newStock = previousStock - normalizedQuantity;
      break;
    }
    case "ADJUSTMENT": {
      newStock = normalizedQuantity;
      break;
    }
    default: {
      throw new Error("Tipo de movimiento no soportado");
    }
  }

  if (newStock < 0) {
    throw new Error("El stock resultante no puede ser negativo");
  }

  const { error: updateError } = await supabase
    .from("product_lots")
    .update({
      quantity_available: newStock,
      updated_at: new Date().toISOString(),
    })
    .eq("id", lotId)
    .eq("organization_id", org.id);

  if (updateError) {
    throw new Error(`No se pudo actualizar el lote: ${updateError.message}`);
  }

  const movementQuantity =
    type === "ADJUSTMENT"
      ? Math.abs(newStock - previousStock)
      : normalizedQuantity;

  const { data: movement, error: movementError } = await supabase
    .from("stock_movements")
    .insert({
      organization_id: org.id,
      lot_id: lotId,
      type,
      quantity: movementQuantity,
      previous_stock: previousStock,
      new_stock: newStock,
      reason: reason?.trim() || null,
    })
    .select("*")
    .maybeSingle();

  if (movementError) {
    await supabase
      .from("product_lots")
      .update({
        quantity_available: previousStock,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lotId)
      .eq("organization_id", org.id);

    throw new Error(
      `No se pudo registrar el movimiento: ${movementError.message}`
    );
  }

  if (!movement) {
    throw new Error("No se pudo registrar el movimiento");
  }

  return movement;
}

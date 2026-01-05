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

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type PriceListItemWithList = {
  cost_price: number;
  price_lists?: {
    id: string;
    name?: string | null;
    valid_from?: string | null;
    supplier_id?: string | null;
    is_active?: boolean | null;
    created_at?: string | null;
  } | null;
};

export type CreateProductInput = {
  orgSlug: string;
  name: string;
  sku: string;
  description?: string;
  brand?: string;
  profit_margin?: number;
  min_stock?: number;
  sale_price?: number;
  category_id?: string;
  supplier_id?: string;
  unit_of_measure: Database["public"]["Enums"]["unit_of_measure_type"];
  units_per_box?: number;
  boxes_per_pallet?: number;
  weight_per_unit?: number;
  image_url?: string;
  tracks_stock_units?: boolean;
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
    sale_price,
    profit_margin,
    min_stock,
    category_id,
    supplier_id,
    unit_of_measure,
    units_per_box,
    boxes_per_pallet,
    weight_per_unit,
    image_url,
    tracks_stock_units,
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

  const canTrackUnits = unit_of_measure === "KG" || unit_of_measure === "LT";
  const tracksUnits = canTrackUnits && Boolean(tracks_stock_units);

  // Create the product
  const { data, error } = await supabase
    .from("products")
    .insert({
      organization_id: org.id,
      name: name.trim(),
      sku: sku.trim(),
      description: sanitize(description),
      brand: sanitize(brand),
      profit_margin: profit_margin ?? null,
      min_stock: min_stock ?? null,
      ...(typeof sale_price === "number" ? { sale_price } : {}),
      category_id: category_id || null,
      supplier_id: supplier_id || null,
      unit_of_measure,
      units_per_box: units_per_box || null,
      boxes_per_pallet: boxes_per_pallet || null,
      weight_per_unit: weight_per_unit || null,
      image_url: sanitize(image_url),
      is_active: true,
      tracks_stock_units: tracksUnits,
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
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: keeps validation and persistence together for clarity
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
    sale_price,
    profit_margin,
    min_stock,
    category_id,
    supplier_id,
    unit_of_measure,
    units_per_box,
    boxes_per_pallet,
    weight_per_unit,
    image_url,
    is_active,
    tracks_stock_units,
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

  const canTrackUnits = unit_of_measure === "KG" || unit_of_measure === "LT";
  let normalizedTracksUnits: boolean | undefined = false;

  if (canTrackUnits) {
    normalizedTracksUnits =
      typeof tracks_stock_units === "boolean" ? tracks_stock_units : undefined;
  }

  const { data, error } = await supabase
    .from("products")
    .update({
      name: name.trim(),
      sku: sku.trim(),
      description: sanitize(description),
      brand: sanitize(brand),
      ...(profit_margin !== undefined
        ? { profit_margin: profit_margin ?? null }
        : {}),
      ...(min_stock !== undefined ? { min_stock: min_stock ?? null } : {}),
      ...(typeof sale_price === "number" ? { sale_price } : {}),
      category_id: category_id || null,
      supplier_id: supplier_id || null,
      unit_of_measure,
      units_per_box: units_per_box || null,
      boxes_per_pallet: boxes_per_pallet || null,
      weight_per_unit: weight_per_unit || null,
      image_url: sanitize(image_url),
      ...(typeof is_active === "boolean" ? { is_active } : {}),
      ...(normalizedTracksUnits !== undefined
        ? { tracks_stock_units: normalizedTracksUnits }
        : {}),
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

  // Build query to get products with aggregated stock and active prices
  // Using products_with_price view which includes cost_price from active price lists
  let query = supabase
    .from("products_with_price")
    .select(
      `
      id,
      sku,
      name,
      image_url,
      brand,
      is_active,
      calculated_sale_price,
      profit_margin,
      cost_price,
      active_price_list_id,
      active_price_list_name,
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

  // Filter out products with null IDs and get valid product IDs to fetch lot quantities
  const productIds = products
    .map((p) => p.id)
    .filter((id): id is string => id !== null);

  if (productIds.length === 0) {
    return [];
  }

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

  // Map to StockItem format, filtering out any products with null required fields
  const stockItems: StockItem[] = products
    .filter((product) => product.id && product.sku && product.name)
    .map((product) => {
      // Type guard ensures these fields exist after filter
      const productId = product.id as string;
      const productSku = product.sku as string;
      const productName = product.name as string;

      return {
        product_id: productId,
        sku: productSku,
        product_name: productName,
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
        total_stock: stockByProduct.get(productId) ?? 0,
        is_active: product.is_active ?? true,
        sale_price: product.calculated_sale_price ?? null,
        profit_margin: product.profit_margin ?? null,
        cost_price: product.cost_price ?? null,
        active_price_list_id: product.active_price_list_id ?? null,
        active_price_list_name: product.active_price_list_name ?? null,
      };
    });

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

const mapCategory = (
  product: ProductWithRelations
): { id: string; name: string } | null =>
  product.categories && typeof product.categories === "object"
    ? {
        id: (product.categories as { id: string; name: string }).id,
        name: (product.categories as { id: string; name: string }).name,
      }
    : null;

const mapSupplier = (
  product: ProductWithRelations
): { id: string; name: string } | null =>
  product.suppliers && typeof product.suppliers === "object"
    ? {
        id: (product.suppliers as { id: string; name: string }).id,
        name: (product.suppliers as { id: string; name: string }).name,
      }
    : null;

type PriceListQueryParams = {
  supabase: SupabaseServerClient;
  orgId: string;
  productId: string;
  supplierId: string | null;
  onlyActive: boolean;
};

const buildPriceListQuery = ({
  supabase,
  orgId,
  productId,
  supplierId,
  onlyActive,
}: PriceListQueryParams) => {
  let query = supabase
    .from("price_list_items")
    .select(
      `
        cost_price,
        price_lists!inner(
          id,
          name,
          valid_from,
          supplier_id,
          is_active,
          created_at
        )
      `
    )
    .eq("product_id", productId)
    .eq("price_lists.organization_id", orgId)
    .order("valid_from", { ascending: false, foreignTable: "price_lists" })
    .order("created_at", { ascending: false, foreignTable: "price_lists" })
    .limit(1);

  if (onlyActive) {
    query = query.eq("price_lists.is_active", true);
  }

  if (supplierId) {
    query = query.eq("price_lists.supplier_id", supplierId);
  }

  return query;
};

const fetchPriceListItem = async (params: PriceListQueryParams) => {
  const { onlyActive } = params;
  const { data, error } =
    await buildPriceListQuery(params).maybeSingle<PriceListItemWithList>();

  if (error) {
    throw new Error(
      `Error fetching price list item${onlyActive ? " (active)" : ""}: ${
        error.message
      }`
    );
  }

  return data;
};

const calculateSalePrice = (
  costPrice: number | null,
  profitMargin: number | null,
  fallbackSalePrice: number | null
): number | null => {
  if (costPrice != null && profitMargin != null) {
    return Math.round(costPrice * (1 + profitMargin / 100) * 100) / 100;
  }

  return fallbackSalePrice ?? null;
};

const resolvePriceInfo = async (
  supabase: SupabaseServerClient,
  orgId: string,
  product: ProductWithRelations,
  productId: string
) => {
  const queryParamsBase = {
    supabase,
    orgId,
    productId,
    supplierId: product.supplier_id ?? null,
  };

  const activePriceItem = await fetchPriceListItem({
    ...queryParamsBase,
    onlyActive: true,
  });

  const priceListItem =
    activePriceItem ??
    (await fetchPriceListItem({
      ...queryParamsBase,
      onlyActive: false,
    }));

  const costPrice = priceListItem?.cost_price ?? null;
  const profitMargin =
    typeof product.profit_margin === "number" ? product.profit_margin : null;

  const salePrice = calculateSalePrice(
    costPrice,
    profitMargin,
    product.sale_price ?? null
  );

  return { costPrice, salePrice };
};

const fetchProductWithRelations = async (
  supabase: SupabaseServerClient,
  orgId: string,
  productId: string
) => {
  const { data, error } = await supabase
    .from("products")
    .select(
      `
        *,
        categories!products_category_id_fkey ( id, name ),
        suppliers!products_supplier_id_fkey ( id, name )
      `
    )
    .eq("organization_id", orgId)
    .eq("id", productId)
    .maybeSingle<ProductWithRelations>();

  if (error) {
    throw new Error(`Error fetching product: ${error.message}`);
  }

  return data;
};

const fetchTotalsForProduct = async (
  supabase: SupabaseServerClient,
  orgId: string,
  productId: string
) => {
  const { data, error } = await supabase
    .from("product_lots")
    .select("quantity_available, unit_quantity_available")
    .eq("organization_id", orgId)
    .eq("product_id", productId);

  if (error) {
    throw new Error(`Error fetching stock: ${error.message}`);
  }

  return (
    data?.reduce<{ totalQuantity: number; totalUnits: number | null }>(
      (acc, lot) => ({
        totalQuantity: acc.totalQuantity + (lot.quantity_available ?? 0),
        totalUnits:
          acc.totalUnits != null || lot.unit_quantity_available != null
            ? (acc.totalUnits ?? 0) + (lot.unit_quantity_available ?? 0)
            : null,
      }),
      { totalQuantity: 0, totalUnits: null }
    ) ?? { totalQuantity: 0, totalUnits: null }
  );
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

  const product = await fetchProductWithRelations(supabase, org.id, productId);

  if (!product) {
    return null;
  }

  const { totalQuantity, totalUnits } = await fetchTotalsForProduct(
    supabase,
    org.id,
    productId
  );

  const { costPrice, salePrice } = await resolvePriceInfo(
    supabase,
    org.id,
    product,
    productId
  );

  const category = mapCategory(product);
  const supplier = mapSupplier(product);

  return {
    product,
    category,
    supplier,
    totalStock: totalQuantity,
    totalUnitStock: totalUnits,
    costPrice,
    salePrice,
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
        unit_quantity,
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
      unit_quantity: movement.unit_quantity ?? null,
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
  unitQuantity?: number;
};

/**
 * Creates a lot for a product.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: keeps validation and persistence together for clarity
export async function createProductLotForOrg(
  input: CreateProductLotInput
): Promise<ProductLotWithStatus> {
  const {
    orgSlug,
    productId,
    lotNumber,
    expirationDate,
    quantity,
    unitQuantity,
  } = input;

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
    .select("id, organization_id, unit_of_measure, tracks_stock_units")
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

  const isUnitTracked =
    (product.unit_of_measure === "KG" || product.unit_of_measure === "LT") &&
    Boolean(product.tracks_stock_units);

  let sanitizedUnitQuantity: number | null = null;
  if (isUnitTracked) {
    sanitizedUnitQuantity =
      typeof unitQuantity === "number" &&
      Number.isFinite(unitQuantity) &&
      unitQuantity >= 0
        ? unitQuantity
        : 0;
  }

  const resolvedExpiration =
    expirationDate ?? new Date("2100-12-31").toISOString().slice(0, 10); // fallback para "sin fecha"

  const insertPayload: Database["public"]["Tables"]["product_lots"]["Insert"] =
    {
      organization_id: org.id,
      product_id: productId,
      lot_number: lotNumber.trim(),
      expiration_date: resolvedExpiration,
      quantity_available: sanitizedQuantity,
    };

  if (isUnitTracked) {
    insertPayload.unit_quantity_available = sanitizedUnitQuantity ?? 0;
  }

  const { data, error } = await supabase
    .from("product_lots")
    .insert(insertPayload)
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
  unitQuantity?: number | null;
};

/**
 * Applies a stock movement to a lot and records it.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: validation and business rules in one place improve clarity
export async function createStockMovementForOrg(
  input: CreateStockMovementInput
) {
  const { orgSlug, productId, lotId, type, quantity, reason, unitQuantity } =
    input;

  if (!lotId) {
    throw new Error("El lote es requerido");
  }

  const normalizedQuantity = Number.isFinite(quantity) ? quantity : 0;
  const hasUnitQuantityInput =
    unitQuantity !== undefined && unitQuantity !== null;
  const normalizedUnitQuantity =
    hasUnitQuantityInput && Number.isFinite(unitQuantity)
      ? Math.max(unitQuantity, 0)
      : 0;

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

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, organization_id, unit_of_measure, tracks_stock_units")
    .eq("id", productId)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (productError) {
    throw new Error(`Error obteniendo el producto: ${productError.message}`);
  }

  if (!product) {
    throw new Error("Producto no encontrado para esta organización");
  }

  const { data: lot, error: lotError } = await supabase
    .from("product_lots")
    .select(
      "id, product_id, organization_id, quantity_available, unit_quantity_available"
    )
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

  const isUnitTracked =
    (product.unit_of_measure === "KG" || product.unit_of_measure === "LT") &&
    Boolean(product.tracks_stock_units);

  const previousStock = lot.quantity_available ?? 0;
  const previousUnitStock = lot.unit_quantity_available ?? 0;

  let newStock = previousStock;
  let newUnitStock = previousUnitStock;

  switch (type) {
    case "INBOUND": {
      newStock = previousStock + normalizedQuantity;
      if (isUnitTracked) {
        if (!hasUnitQuantityInput || normalizedUnitQuantity <= 0) {
          throw new Error("Ingresa las unidades para registrar el ingreso");
        }
        newUnitStock = previousUnitStock + normalizedUnitQuantity;
      }
      break;
    }
    case "OUTBOUND": {
      if (normalizedQuantity > previousStock) {
        throw new Error("No hay stock suficiente en el lote");
      }
      newStock = previousStock - normalizedQuantity;
      if (isUnitTracked) {
        if (!hasUnitQuantityInput || normalizedUnitQuantity <= 0) {
          throw new Error("Ingresa las unidades para registrar la salida");
        }
        if (normalizedUnitQuantity > previousUnitStock) {
          throw new Error("No hay unidades suficientes en el lote");
        }
        newUnitStock = previousUnitStock - normalizedUnitQuantity;
      }
      break;
    }
    case "ADJUSTMENT": {
      newStock = normalizedQuantity;
      if (isUnitTracked && hasUnitQuantityInput) {
        newUnitStock = normalizedUnitQuantity;
      }
      break;
    }
    default: {
      throw new Error("Tipo de movimiento no soportado");
    }
  }

  if (newStock < 0) {
    throw new Error("El stock resultante no puede ser negativo");
  }

  if (isUnitTracked && newUnitStock < 0) {
    throw new Error("El stock de unidades no puede ser negativo");
  }

  const lotUpdatePayload: Database["public"]["Tables"]["product_lots"]["Update"] =
    {
      quantity_available: newStock,
      updated_at: new Date().toISOString(),
    };

  if (isUnitTracked) {
    lotUpdatePayload.unit_quantity_available = newUnitStock;
  }

  const { error: updateError } = await supabase
    .from("product_lots")
    .update(lotUpdatePayload)
    .eq("id", lotId)
    .eq("organization_id", org.id);

  if (updateError) {
    throw new Error(`No se pudo actualizar el lote: ${updateError.message}`);
  }

  const movementQuantity =
    type === "ADJUSTMENT"
      ? Math.abs(newStock - previousStock)
      : normalizedQuantity;

  let movementUnitQuantity: number | null = null;

  if (isUnitTracked) {
    if (type === "INBOUND") {
      movementUnitQuantity = normalizedUnitQuantity;
    } else if (type === "OUTBOUND") {
      movementUnitQuantity = -normalizedUnitQuantity;
    } else if (hasUnitQuantityInput) {
      movementUnitQuantity = newUnitStock - previousUnitStock;
    }

    if (movementUnitQuantity === 0) {
      movementUnitQuantity = null;
    }
  }

  const { data: movement, error: movementError } = await supabase
    .from("stock_movements")
    .insert({
      organization_id: org.id,
      lot_id: lotId,
      type,
      quantity: movementQuantity,
      previous_stock: previousStock,
      new_stock: newStock,
      unit_quantity: movementUnitQuantity,
      reason: reason?.trim() || null,
    })
    .select("*")
    .maybeSingle();

  if (movementError) {
    const rollbackPayload: Database["public"]["Tables"]["product_lots"]["Update"] =
      {
        quantity_available: previousStock,
        updated_at: new Date().toISOString(),
      };

    if (isUnitTracked) {
      rollbackPayload.unit_quantity_available = previousUnitStock;
    }

    await supabase
      .from("product_lots")
      .update(rollbackPayload)
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

/**
 * Gets all products for a specific supplier in an organization.
 * Returns products with name and SKU for export purposes.
 */
export async function getProductsBySupplierId(
  orgSlug: string,
  supplierId: string
): Promise<Pick<Product, "id" | "name" | "sku">[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("products")
    .select("id, name, sku")
    .eq("organization_id", org.id)
    .eq("supplier_id", supplierId)
    .eq("is_active", true)
    .order("name");

  if (error) {
    throw new Error(`Error al obtener productos: ${error.message}`);
  }

  return data ?? [];
}

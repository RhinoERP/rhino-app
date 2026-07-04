import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { Database } from "@/types/supabase";
import type {
  DirectSaleTemplateProduct,
  Product,
  ProductDetail,
  ProductLotWithStatus,
  ProductVariantWithStock,
  StockFilters,
  StockItem,
  StockMovementType,
  StockMovementWithLot,
} from "../types";
import { calculateSalePriceFromCostAndMargin } from "../utils/price-calculations";

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

type LotUsageMovementRow = Pick<
  Database["public"]["Tables"]["stock_movements"]["Row"],
  "lot_id" | "type" | "quantity" | "unit_quantity" | "reason"
>;

type LotMovementUsage = {
  totalMovementCount: number;
  hasSalesReferences: boolean;
  soldQuantityFromSales: number;
  soldUnitQuantityFromSales: number | null;
};

const SALE_REASON_PREFIX = "venta";
const SALE_RESTOCK_REASON_PREFIX = "reingreso venta";
const SALE_STOCK_MOVEMENT_TYPES = new Set<string>(["OUTBOUND", "POS_SALE"]);
const NO_EXPIRATION_FALLBACK = "2100-12-31";

function sanitizeOptionalText(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function resolveBarcodeValue(sku: string, barcode?: string | null): string {
  return sanitizeOptionalText(barcode) ?? sku.trim();
}

async function ensureBarcodeIsAvailable(params: {
  supabase: SupabaseServerClient;
  organizationId: string;
  barcode: string;
  excludeProductId?: string;
}): Promise<void> {
  const { supabase, organizationId, barcode, excludeProductId } = params;

  let query = supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("barcode", barcode);

  if (excludeProductId) {
    query = query.neq("id", excludeProductId);
  }

  const { count, error } = await query;

  if (error) {
    throw new Error(`No se pudo validar el código de barras: ${error.message}`);
  }

  if ((count ?? 0) > 0) {
    throw new Error(
      `El código de barras "${barcode}" ya está asignado a otro producto.`
    );
  }
}

function getProductPersistenceErrorMessage(
  errorMessage: string,
  barcode: string
): string {
  if (errorMessage.toLowerCase().includes("barcode")) {
    return `El código de barras "${barcode}" ya está asignado a otro producto.`;
  }

  return errorMessage;
}
function validateProfitMargin(profitMargin: number | undefined) {
  if (profitMargin === undefined) {
    return;
  }

  if (!Number.isFinite(profitMargin) || profitMargin < 0) {
    throw new Error("El margen debe ser mayor o igual a 0");
  }
}
export type CreateProductInput = {
  orgSlug: string;
  name: string;
  sku: string;
  barcode?: string;
  description?: string;
  brand?: string;
  accounting_account_code?: string;
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
  has_variants?: boolean;
  talles?: string[];
  colores?: string[];
  tax_ids?: string[];
};

type ProductMeta = {
  unit_of_measure: Database["public"]["Enums"]["unit_of_measure_type"] | null;
  tracks_stock_units: boolean | null;
  has_variants: boolean | null;
};

async function syncProductTaxAssignments(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  productId: string;
  taxIds?: string[];
}): Promise<void> {
  if (!params.taxIds) {
    return;
  }

  const uniqueTaxIds = Array.from(new Set(params.taxIds.filter(Boolean)));
  const { error: deleteError } = await params.supabase
    .from("product_tax_assignments" as never)
    .delete()
    .eq("organization_id", params.orgId)
    .eq("product_id", params.productId);

  if (deleteError) {
    throw new Error(
      `No se pudieron actualizar los impuestos del producto: ${deleteError.message}`
    );
  }

  if (uniqueTaxIds.length === 0) {
    return;
  }

  const { error: insertError } = await params.supabase
    .from("product_tax_assignments" as never)
    .insert(
      uniqueTaxIds.map((taxId) => ({
        organization_id: params.orgId,
        product_id: params.productId,
        tax_id: taxId,
      })) as never
    );

  if (insertError) {
    throw new Error(
      `No se pudieron guardar los impuestos del producto: ${insertError.message}`
    );
  }
}

export async function getProductTaxIds(
  orgSlug: string,
  productId: string
): Promise<string[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_tax_assignments" as never)
    .select("tax_id")
    .eq("organization_id", org.id)
    .eq("product_id", productId);

  if (error) {
    throw new Error(
      `No se pudieron obtener los impuestos del producto: ${error.message}`
    );
  }

  return ((data ?? []) as Array<{ tax_id?: string | null }>)
    .map((row) => row.tax_id)
    .filter((taxId): taxId is string => Boolean(taxId));
}

type StockDetailRow = Database["public"]["Views"]["view_stock_detail"]["Row"];

function buildStockSummaryQuery(
  supabase: SupabaseServerClient,
  orgId: string,
  filters: StockFilters
) {
  let query = supabase
    .from("view_stock_detail")
    .select("*")
    .eq("organization_id", orgId);

  if (filters.query) {
    query = query.or(
      `sku.ilike.%${filters.query}%,product_name.ilike.%${filters.query}%`
    );
  }

  if (filters.supplier) {
    query = query.eq("supplier_name", filters.supplier);
  }

  if (filters.category) {
    query = query.eq("category_name", filters.category);
  }

  if (filters.status === "active") {
    query = query.eq("is_active", true);
  } else if (filters.status === "inactive") {
    query = query.eq("is_active", false);
  }

  return query.order("product_name");
}

function extractProductIds(data: StockDetailRow[]): string[] {
  return data
    .map((item) => item.product_id)
    .filter((id): id is string => Boolean(id));
}

async function fetchProductMetaById(
  supabase: SupabaseServerClient,
  orgId: string,
  productIds: string[]
): Promise<Map<string, ProductMeta>> {
  const productMetaById = new Map<string, ProductMeta>();
  if (productIds.length === 0) {
    return productMetaById;
  }

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, unit_of_measure, tracks_stock_units, has_variants")
    .eq("organization_id", orgId)
    .in("id", productIds);

  if (productsError) {
    throw new Error(
      `Error fetching product metadata: ${productsError.message}`
    );
  }

  for (const product of products ?? []) {
    if (!product.id) {
      continue;
    }
    productMetaById.set(product.id, {
      unit_of_measure: product.unit_of_measure ?? null,
      tracks_stock_units: product.tracks_stock_units ?? null,
      has_variants: product.has_variants ?? null,
    });
  }

  return productMetaById;
}

function getProductsTrackingUnits(
  productMetaById: Map<string, ProductMeta>
): string[] {
  const productIds: string[] = [];
  for (const [id, meta] of productMetaById.entries()) {
    if (
      meta.tracks_stock_units &&
      (meta.unit_of_measure === "KG" || meta.unit_of_measure === "LT")
    ) {
      productIds.push(id);
    }
  }
  return productIds;
}

async function fetchUnitTotalsByProductId(
  supabase: SupabaseServerClient,
  orgId: string,
  productMetaById: Map<string, ProductMeta>
): Promise<Map<string, number>> {
  const unitTotalsByProductId = new Map<string, number>();
  const productsTrackingUnits = getProductsTrackingUnits(productMetaById);
  if (productsTrackingUnits.length === 0) {
    return unitTotalsByProductId;
  }

  const { data: lots, error: lotsError } = await supabase
    .from("product_lots")
    .select("product_id, unit_quantity_available")
    .eq("organization_id", orgId)
    .in("product_id", productsTrackingUnits);

  if (lotsError) {
    throw new Error(`Error fetching stock units: ${lotsError.message}`);
  }

  for (const lot of lots ?? []) {
    if (!lot.product_id) {
      continue;
    }
    const previous = unitTotalsByProductId.get(lot.product_id) ?? 0;
    const delta = lot.unit_quantity_available ?? 0;
    unitTotalsByProductId.set(lot.product_id, previous + delta);
  }

  return unitTotalsByProductId;
}

async function fetchVariantTotalsByProductId(
  supabase: SupabaseServerClient,
  orgId: string,
  productMetaById: Map<string, ProductMeta>
): Promise<Map<string, number>> {
  const variantTotals = new Map<string, number>();
  const productIds: string[] = [];
  for (const [id, meta] of productMetaById.entries()) {
    if (meta.has_variants) {
      productIds.push(id);
    }
  }

  if (productIds.length === 0) {
    return variantTotals;
  }

  const { data, error } = await supabase
    .from("product_variants")
    .select("product_id, lot_id, product_lots(quantity_available)")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .in("product_id", productIds);

  if (error) {
    throw new Error(`Error fetching variant stock: ${error.message}`);
  }

  for (const row of data ?? []) {
    const prev = variantTotals.get(row.product_id) ?? 0;
    const lotStock =
      (
        row.product_lots as unknown as {
          quantity_available: number;
        } | null
      )?.quantity_available ?? 0;
    variantTotals.set(row.product_id, prev + lotStock);
  }
  return variantTotals;
}

function buildStockItems(
  data: StockDetailRow[],
  productMetaById: Map<string, ProductMeta>,
  unitTotalsByProductId: Map<string, number>,
  variantTotalsByProductId: Map<string, number>
): StockItem[] {
  return data
    .filter((item) => item.product_id && item.sku && item.product_name)
    .map((item) => {
      const productId = item.product_id as string;
      const productMeta = productMetaById.get(productId);
      const unitOfMeasure = productMeta?.unit_of_measure ?? null;
      const tracksUnits = productMeta?.tracks_stock_units ?? null;
      const hasVariants = productMeta?.has_variants ?? false;
      const totalUnits =
        tracksUnits && (unitOfMeasure === "KG" || unitOfMeasure === "LT")
          ? (unitTotalsByProductId.get(productId) ?? 0)
          : null;

      const variantStock = hasVariants
        ? (variantTotalsByProductId.get(productId) ?? 0)
        : 0;

      return {
        ...item,
        product_id: productId,
        sku: item.sku as string,
        product_name: item.product_name as string,
        total_stock: hasVariants ? variantStock : (item.total_stock ?? 0),
        is_active: item.is_active ?? true,
        unit_of_measure: unitOfMeasure,
        tracks_stock_units: tracksUnits,
        total_unit_stock: totalUnits,
        has_variants: hasVariants,
      };
    });
}
/**
 * Creates a new product in the organization.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: keeps validation and persistence together for clarity
export async function createProductForOrg(
  input: CreateProductInput
): Promise<Product | Product[]> {
  const {
    orgSlug,
    name,
    sku,
    barcode,
    description,
    brand,
    accounting_account_code,
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
    has_variants,
    talles,
    colores,
    tax_ids,
  } = input;

  if (!name?.trim()) {
    throw new Error("El nombre del producto es requerido");
  }

  if (!sku?.trim()) {
    throw new Error("El SKU es requerido");
  }

  validateProfitMargin(profit_margin);

  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();
  const normalizedSku = sku.trim();
  const resolvedBarcode = resolveBarcodeValue(normalizedSku, barcode);
  await ensureBarcodeIsAvailable({
    supabase,
    organizationId: org.id,
    barcode: resolvedBarcode,
  });

  const canTrackUnits = unit_of_measure === "KG" || unit_of_measure === "LT";
  const tracksUnits = canTrackUnits && Boolean(tracks_stock_units);

  const baseProductData = {
    organization_id: org.id,
    description: sanitizeOptionalText(description),
    brand: sanitizeOptionalText(brand),
    accounting_account_code: sanitizeOptionalText(accounting_account_code),
    profit_margin: profit_margin ?? null,
    min_stock: min_stock ?? null,
    ...(typeof sale_price === "number" ? { sale_price } : {}),
    category_id: category_id || null,
    supplier_id: supplier_id || null,
    unit_of_measure,
    units_per_box: units_per_box || null,
    boxes_per_pallet: boxes_per_pallet || null,
    weight_per_unit: weight_per_unit || null,
    image_url: sanitizeOptionalText(image_url),
    tracks_stock_units: tracksUnits,
  };

  // 1. Insertamos el producto principal UNA SOLA VEZ
  const { data: productData, error: productError } = await supabase
    .from("products")
    .insert({
      ...baseProductData,
      organization_id: org.id,
      name: name.trim(),
      sku: normalizedSku,
      has_variants: has_variants ?? false,
      barcode: resolvedBarcode,
      is_active: true,
    })
    .select("*")
    .single();

  if (productError || !productData) {
    throw new Error(
      `No se pudo crear el producto: ${getProductPersistenceErrorMessage(productError?.message ?? "", resolvedBarcode)}`
    );
  }

  // 2. Si tiene variantes, creamos lotes DEFAULT y las guardamos
  if (has_variants) {
    if (!(talles && colores) || talles.length === 0 || colores.length === 0) {
      throw new Error(
        "Se requiere al menos un talle y un color si el producto tiene variantes"
      );
    }

    const lotsToInsert = talles.flatMap(() =>
      colores.map(() => ({
        organization_id: org.id,
        product_id: productData.id,
        lot_number: "DEFAULT",
        expiration_date: null,
        quantity_available: 0,
      }))
    );

    const { data: insertedLots, error: lotsError } = await supabase
      .from("product_lots")
      .insert(lotsToInsert)
      .select("id");

    if (lotsError || !insertedLots) {
      throw new Error(
        `Error al crear lotes para variantes: ${lotsError?.message}`
      );
    }

    let i = 0;
    const variantsToInsert = talles.flatMap((talle) =>
      colores.map((color) => {
        const lotId = insertedLots[i].id;
        i += 1;
        return {
          organization_id: org.id,
          product_id: productData.id,
          talle,
          color,
          stock: 0,
          lot_id: lotId,
        };
      })
    );

    const { error: variantsError } = await supabase
      .from("product_variants")
      .insert(variantsToInsert);

    if (variantsError) {
      throw new Error(`Error al crear variantes: ${variantsError.message}`);
    }
  }
  await syncProductTaxAssignments({
    supabase,
    orgId: org.id,
    productId: productData.id,
    taxIds: tax_ids,
  });

  return productData;
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
    barcode,
    description,
    brand,
    accounting_account_code,
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
    has_variants,
    talles,
    colores,
    tax_ids,
  } = input;

  if (!name?.trim()) {
    throw new Error("El nombre del producto es requerido");
  }

  if (!sku?.trim()) {
    throw new Error("El SKU es requerido");
  }

  validateProfitMargin(profit_margin);

  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();
  const normalizedSku = sku.trim();
  const normalizedBarcode =
    barcode !== undefined
      ? resolveBarcodeValue(normalizedSku, barcode)
      : undefined;

  if (normalizedBarcode) {
    await ensureBarcodeIsAvailable({
      supabase,
      organizationId: org.id,
      barcode: normalizedBarcode,
      excludeProductId: productId,
    });
  }

  const canTrackUnits = unit_of_measure === "KG" || unit_of_measure === "LT";
  let normalizedTracksUnits: boolean | undefined = false;

  if (canTrackUnits) {
    normalizedTracksUnits =
      typeof tracks_stock_units === "boolean" ? tracks_stock_units : undefined;
  }

  const { data: currentProduct, error: currentProductError } = await supabase
    .from("products")
    .select("has_variants")
    .eq("id", productId)
    .single();

  if (currentProductError) {
    throw new Error(
      `Error al consultar el producto: ${currentProductError.message}`
    );
  }

  if (
    has_variants !== undefined &&
    currentProduct?.has_variants !== has_variants
  ) {
    // Check if it has sales by checking outbound movements with reason 'venta'
    const { data: productLots } = await supabase
      .from("product_lots")
      .select("id")
      .eq("product_id", productId);

    if (productLots && productLots.length > 0) {
      const lotIds = productLots.map((l) => l.id);
      const { data: sales } = await supabase
        .from("stock_movements")
        .select("id")
        .eq("type", "OUTBOUND")
        .ilike("reason", "venta%")
        .in("lot_id", lotIds)
        .limit(1);

      if (sales && sales.length > 0) {
        throw new Error(
          "No se puede cambiar el manejo de variantes porque el producto ya tiene ventas registradas."
        );
      }
    }
  }

  const { data, error } = await supabase
    .from("products")
    .update({
      name: name.trim(),
      sku: normalizedSku,
      ...(normalizedBarcode !== undefined
        ? { barcode: normalizedBarcode }
        : {}),
      description: sanitizeOptionalText(description),
      brand: sanitizeOptionalText(brand),
      accounting_account_code: sanitizeOptionalText(accounting_account_code),
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
      image_url: sanitizeOptionalText(image_url),
      ...(typeof is_active === "boolean" ? { is_active } : {}),
      ...(normalizedTracksUnits !== undefined
        ? { tracks_stock_units: normalizedTracksUnits }
        : {}),
      ...(has_variants !== undefined ? { has_variants } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", productId)
    .eq("organization_id", org.id)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(
      `No se pudo actualizar el producto: ${getProductPersistenceErrorMessage(
        error.message,
        normalizedBarcode ?? normalizedSku
      )}`
    );
  }

  if (!data) {
    throw new Error("No se pudo actualizar el producto");
  }

  if (has_variants && talles && colores) {
    if (talles.length === 0 || colores.length === 0) {
      throw new Error(
        "Se requiere al menos un talle y un color si el producto tiene variantes"
      );
    }

    const { data: existingVariants, error: fetchError } = await supabase
      .from("product_variants")
      .select("id, talle, color")
      .eq("organization_id", org.id)
      .eq("product_id", productId);

    if (fetchError) {
      throw new Error(
        `Error al obtener variantes existentes: ${fetchError.message}`
      );
    }

    const existingSet = new Set(
      existingVariants?.map((v) => `${v.talle}-${v.color}`) || []
    );

    const desiredKeys = new Set(
      talles.flatMap((t) => colores.map((c) => `${t}-${c}`))
    );

    // Desactivar las que ya no están
    const variantsToRemove =
      existingVariants?.filter(
        (v) => !desiredKeys.has(`${v.talle}-${v.color}`)
      ) || [];
    for (const v of variantsToRemove) {
      await supabase
        .from("product_variants")
        .update({ is_active: false })
        .eq("id", v.id);
    }

    // Identificar las nuevas
    const missingCombinations: { talle: string; color: string }[] = [];
    for (const talle of talles) {
      for (const color of colores) {
        if (!existingSet.has(`${talle}-${color}`)) {
          missingCombinations.push({ talle, color });
        }
      }
    }

    if (missingCombinations.length > 0) {
      const lotsToInsert = missingCombinations.map(() => ({
        organization_id: org.id,
        product_id: productId,
        lot_number: "DEFAULT",
        expiration_date: null,
        quantity_available: 0,
      }));

      const { data: insertedLots, error: lotsError } = await supabase
        .from("product_lots")
        .insert(lotsToInsert)
        .select("id");

      if (lotsError || !insertedLots) {
        throw new Error(
          `Error al crear lotes para nuevas variantes: ${lotsError?.message}`
        );
      }

      const variantsToInsert = missingCombinations.map((comb, i) => ({
        organization_id: org.id,
        product_id: productId,
        talle: comb.talle,
        color: comb.color,
        stock: 0,
        lot_id: insertedLots[i].id,
      }));

      const { error: variantsError } = await supabase
        .from("product_variants")
        .insert(variantsToInsert);

      if (variantsError) {
        throw new Error(
          `Error al crear nuevas variantes: ${variantsError.message}`
        );
      }
    }
  }

  await syncProductTaxAssignments({
    supabase,
    orgId: org.id,
    productId: data.id,
    taxIds: tax_ids,
  });

  return data;
}

/**
 * Gets aggregated stock summary for all products in an organization.
 * Uses the view_stock_detail view which includes pre-joined category and supplier names.
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

  const query = buildStockSummaryQuery(supabase, org.id, filters);
  const { data, error } = await query;

  if (error) {
    throw new Error(`Error fetching stock data: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return [];
  }

  const productIds = extractProductIds(data);
  const productMetaById = await fetchProductMetaById(
    supabase,
    org.id,
    productIds
  );
  const unitTotalsByProductId = await fetchUnitTotalsByProductId(
    supabase,
    org.id,
    productMetaById
  );
  const variantTotalsByProductId = await fetchVariantTotalsByProductId(
    supabase,
    org.id,
    productMetaById
  );

  return buildStockItems(
    data,
    productMetaById,
    unitTotalsByProductId,
    variantTotalsByProductId
  );
}

/**
 * Gets all variants and their stock for a specific product.
 */
export async function getProductVariantsWithStock(
  orgSlug: string,
  productId: string
): Promise<ProductVariantWithStock[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("product_variants")
    .select("*, product_lots(id, quantity_available)")
    .eq("organization_id", org.id)
    .eq("product_id", productId)
    .eq("is_active", true)
    .order("talle")
    .order("color");

  if (error) {
    throw new Error(`Error obteniendo variantes: ${error.message}`);
  }

  return (data ?? []) as unknown as ProductVariantWithStock[];
}

/**
 * Adjusts the stock of a specific variant.
 */
export async function adjustVariantStock(input: {
  orgSlug: string;
  variantId: string;
  type: StockMovementType;
  quantity: number;
  reason: string;
}): Promise<void> {
  const { orgSlug, variantId, type, quantity, reason } = input;
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data: variant, error: variantError } = await supabase
    .from("product_variants")
    .select("product_id, lot_id")
    .eq("id", variantId)
    .eq("organization_id", org.id)
    .single();

  if (variantError || !variant) {
    throw new Error(`Error obteniendo la variante: ${variantError?.message}`);
  }

  if (!variant.lot_id) {
    throw new Error("La variante no tiene un lote asignado para ajustar stock");
  }

  await createStockMovementForOrg({
    orgSlug,
    productId: variant.product_id,
    lotId: variant.lot_id,
    type,
    quantity,
    reason,
  });
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
  lot: Database["public"]["Tables"]["product_lots"]["Row"],
  usage?: LotMovementUsage
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
    hasSalesReferences: usage?.hasSalesReferences ?? false,
    soldQuantityFromSales: usage?.soldQuantityFromSales ?? 0,
    soldUnitQuantityFromSales: usage?.soldUnitQuantityFromSales ?? null,
  };
};

const normalizeMovementReason = (reason: string | null): string =>
  reason?.trim().toLocaleLowerCase() ?? "";

const isSaleOutboundMovement = (movement: LotUsageMovementRow): boolean =>
  SALE_STOCK_MOVEMENT_TYPES.has(movement.type) &&
  normalizeMovementReason(movement.reason).startsWith(SALE_REASON_PREFIX);

const isSaleRestockMovement = (movement: LotUsageMovementRow): boolean =>
  movement.type === "INBOUND" &&
  normalizeMovementReason(movement.reason).startsWith(
    SALE_RESTOCK_REASON_PREFIX
  );

const buildEmptyLotMovementUsage = (): LotMovementUsage => ({
  totalMovementCount: 0,
  hasSalesReferences: false,
  soldQuantityFromSales: 0,
  soldUnitQuantityFromSales: null,
});

type LotMovementUsageAccumulator = {
  totalMovementCount: number;
  hasSalesReferences: boolean;
  saleOutboundQuantity: number;
  saleRestockQuantity: number;
  saleOutboundUnits: number;
  saleRestockUnits: number;
};

const createLotMovementUsageAccumulator = (): LotMovementUsageAccumulator => ({
  totalMovementCount: 0,
  hasSalesReferences: false,
  saleOutboundQuantity: 0,
  saleRestockQuantity: 0,
  saleOutboundUnits: 0,
  saleRestockUnits: 0,
});

const applySaleOutboundUsage = (
  accumulator: LotMovementUsageAccumulator,
  movement: LotUsageMovementRow
) => {
  if (!isSaleOutboundMovement(movement)) {
    return;
  }

  accumulator.hasSalesReferences = true;
  accumulator.saleOutboundQuantity += Math.abs(movement.quantity ?? 0);
  accumulator.saleOutboundUnits += Math.abs(movement.unit_quantity ?? 0);
};

const applySaleRestockUsage = (
  accumulator: LotMovementUsageAccumulator,
  movement: LotUsageMovementRow
) => {
  if (!isSaleRestockMovement(movement)) {
    return;
  }

  accumulator.hasSalesReferences = true;
  accumulator.saleRestockQuantity += Math.abs(movement.quantity ?? 0);
  accumulator.saleRestockUnits += Math.abs(movement.unit_quantity ?? 0);
};

const applyMovementToLotUsage = (
  accumulator: LotMovementUsageAccumulator,
  movement: LotUsageMovementRow
) => {
  accumulator.totalMovementCount += 1;
  applySaleOutboundUsage(accumulator, movement);
  applySaleRestockUsage(accumulator, movement);
};

const finalizeLotMovementUsage = (
  accumulator: LotMovementUsageAccumulator
): LotMovementUsage => {
  const soldUnitQuantityFromSales =
    accumulator.saleOutboundUnits > 0 || accumulator.saleRestockUnits > 0
      ? Math.max(
          0,
          accumulator.saleOutboundUnits - accumulator.saleRestockUnits
        )
      : null;

  return {
    totalMovementCount: accumulator.totalMovementCount,
    hasSalesReferences: accumulator.hasSalesReferences,
    soldQuantityFromSales: Math.max(
      0,
      accumulator.saleOutboundQuantity - accumulator.saleRestockQuantity
    ),
    soldUnitQuantityFromSales,
  };
};

function summarizeLotMovementUsage(
  movements: LotUsageMovementRow[]
): Map<string, LotMovementUsage> {
  const usageAccByLotId = new Map<string, LotMovementUsageAccumulator>();

  for (const movement of movements) {
    if (!movement.lot_id) {
      continue;
    }

    const current =
      usageAccByLotId.get(movement.lot_id) ??
      createLotMovementUsageAccumulator();
    applyMovementToLotUsage(current, movement);
    usageAccByLotId.set(movement.lot_id, current);
  }

  const usageByLotId = new Map<string, LotMovementUsage>();

  for (const [lotId, usage] of usageAccByLotId.entries()) {
    usageByLotId.set(lotId, finalizeLotMovementUsage(usage));
  }

  return usageByLotId;
}

async function fetchLotMovementUsageByIds(
  supabase: SupabaseServerClient,
  orgId: string,
  lotIds: string[]
): Promise<Map<string, LotMovementUsage>> {
  if (lotIds.length === 0) {
    return new Map<string, LotMovementUsage>();
  }

  const { data, error } = await supabase
    .from("stock_movements")
    .select("lot_id, type, quantity, unit_quantity, reason")
    .eq("organization_id", orgId)
    .in("lot_id", lotIds);

  if (error) {
    throw new Error(`Error obteniendo uso de lotes: ${error.message}`);
  }

  return summarizeLotMovementUsage((data ?? []) as LotUsageMovementRow[]);
}

async function fetchLotMovementUsage(
  supabase: SupabaseServerClient,
  orgId: string,
  lotId: string
): Promise<LotMovementUsage> {
  const usageByLotId = await fetchLotMovementUsageByIds(supabase, orgId, [
    lotId,
  ]);

  return usageByLotId.get(lotId) ?? buildEmptyLotMovementUsage();
}

async function fetchLotMovements(
  supabase: SupabaseServerClient,
  orgId: string,
  lotId: string
): Promise<LotUsageMovementRow[]> {
  const { data, error } = await supabase
    .from("stock_movements")
    .select("lot_id, type, quantity, unit_quantity, reason")
    .eq("organization_id", orgId)
    .eq("lot_id", lotId);

  if (error) {
    throw new Error(`Error obteniendo movimientos del lote: ${error.message}`);
  }

  return (data ?? []) as LotUsageMovementRow[];
}

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
  const calculatedSalePrice = calculateSalePriceFromCostAndMargin(
    costPrice,
    profitMargin
  );
  if (calculatedSalePrice != null) {
    return calculatedSalePrice;
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
  productId: string,
  hasVariants?: boolean
) => {
  if (hasVariants) {
    const { data: variants, error: variantsError } = await supabase
      .from("product_variants")
      .select("lot_id, product_lots(quantity_available)")
      .eq("organization_id", orgId)
      .eq("product_id", productId)
      .eq("is_active", true);

    if (variantsError) {
      throw new Error(`Error fetching variant stock: ${variantsError.message}`);
    }

    const totalQuantity =
      variants?.reduce((acc, v) => {
        const stock =
          (
            v.product_lots as unknown as {
              quantity_available: number;
            } | null
          )?.quantity_available ?? 0;
        return acc + stock;
      }, 0) ?? 0;

    return { totalQuantity, totalUnits: null };
  }

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
    productId,
    product.has_variants
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

  const lots = data ?? [];
  const lotIds = lots.map((lot) => lot.id).filter(Boolean);
  const usageByLotId = await fetchLotMovementUsageByIds(
    supabase,
    org.id,
    lotIds
  );

  return lots.map((lot) => addLotStatus(lot, usageByLotId.get(lot.id)));
}

/**
 * Returns all lots for a product filtering by lot ID
 */

export async function getProductLotById(
  orgSlug: string,
  lotId: string
): Promise<ProductLotWithStatus | null> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return null;
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_lots")
    .select("*")
    .eq("id", lotId)
    .eq("organization_id", org.id)
    .single();
  if (error) {
    return null;
  }
  return addLotStatus(data, undefined);
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

  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data: product, error: productError } = await supabase
    .from("products")
    .select(
      "id, organization_id, unit_of_measure, tracks_stock_units, has_variants"
    )
    .eq("id", productId)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (productError) {
    throw new Error(`Error validando el producto: ${productError.message}`);
  }

  if (!product) {
    throw new Error("Producto no encontrado para esta organización");
  }

  let finalExpirationDate = expirationDate;
  if (product.has_variants) {
    finalExpirationDate = null;
  } else if (!finalExpirationDate) {
    throw new Error(
      "La fecha de vencimiento es requerida para productos sin variantes"
    );
  }

  if (finalExpirationDate) {
    const parsed = new Date(finalExpirationDate);
    const year = parsed.getFullYear();
    if (Number.isNaN(parsed.getTime()) || year < 1900 || year > 2100) {
      throw new Error("La fecha de vencimiento no es válida");
    }
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

  const resolvedExpiration = finalExpirationDate ?? NO_EXPIRATION_FALLBACK;

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

export type UpdateProductLotInput = {
  orgSlug: string;
  productId: string;
  lotId: string;
  lotNumber: string;
  expirationDate: string | null;
  quantity: number;
  unitQuantity?: number;
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: lot edition includes inventory consistency checks tied to sales usage
export async function updateProductLotForOrg(
  input: UpdateProductLotInput
): Promise<ProductLotWithStatus> {
  const {
    orgSlug,
    productId,
    lotId,
    lotNumber,
    expirationDate,
    quantity,
    unitQuantity,
  } = input;

  if (!lotId) {
    throw new Error("El lote es requerido");
  }

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

  if (!Number.isFinite(quantity) || quantity < 0) {
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
    throw new Error(`Error validando el producto: ${productError.message}`);
  }

  if (!product) {
    throw new Error("Producto no encontrado para esta organización");
  }

  const { data: lot, error: lotError } = await supabase
    .from("product_lots")
    .select(
      "id, product_id, organization_id, lot_number, expiration_date, quantity_available, unit_quantity_available"
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

  let sanitizedUnitQuantity: number | null = null;
  if (isUnitTracked) {
    if (
      unitQuantity === undefined ||
      !Number.isFinite(unitQuantity) ||
      unitQuantity < 0
    ) {
      throw new Error("Las unidades no pueden ser negativas");
    }
    sanitizedUnitQuantity = unitQuantity;
  }

  const lotUsage = await fetchLotMovementUsage(supabase, org.id, lotId);
  const normalizedQuantity = Math.max(0, quantity);

  const soldQuantityFromSales = lotUsage.soldQuantityFromSales ?? 0;
  const soldUnitQuantityFromSales = lotUsage.soldUnitQuantityFromSales ?? 0;

  if (soldQuantityFromSales > 0) {
    const previousQuantity = lot.quantity_available ?? 0;
    const minAllowedQuantity = Math.max(
      0,
      previousQuantity - soldQuantityFromSales
    );

    if (normalizedQuantity < minAllowedQuantity) {
      throw new Error(
        `No puedes reducir la cantidad por debajo de ${minAllowedQuantity.toLocaleString("es-AR")} porque este lote ya fue usado en ventas. Si necesitas reducir stock, realiza un ajuste en los movimientos de stock.`
      );
    }
  }

  if (isUnitTracked && soldUnitQuantityFromSales > 0) {
    const previousUnitQuantity = lot.unit_quantity_available ?? 0;
    const minAllowedUnitQuantity = Math.max(
      0,
      previousUnitQuantity - soldUnitQuantityFromSales
    );

    if ((sanitizedUnitQuantity ?? 0) < minAllowedUnitQuantity) {
      throw new Error(
        `No puedes reducir las unidades por debajo de ${minAllowedUnitQuantity.toLocaleString("es-AR")} porque este lote ya fue usado en ventas. Si necesitas reducir stock, realiza un ajuste en los movimientos de stock.`
      );
    }
  }

  const resolvedExpiration = expirationDate ?? NO_EXPIRATION_FALLBACK;

  const updatePayload: Database["public"]["Tables"]["product_lots"]["Update"] =
    {
      lot_number: lotNumber.trim(),
      expiration_date: resolvedExpiration,
      quantity_available: normalizedQuantity,
      updated_at: new Date().toISOString(),
    };

  if (isUnitTracked) {
    updatePayload.unit_quantity_available = sanitizedUnitQuantity ?? 0;
  }

  const { data: updatedLot, error: updateError } = await supabase
    .from("product_lots")
    .update(updatePayload)
    .eq("id", lotId)
    .eq("organization_id", org.id)
    .select("*")
    .maybeSingle();

  if (updateError) {
    throw new Error(`No se pudo actualizar el lote: ${updateError.message}`);
  }

  if (!updatedLot) {
    throw new Error("No se pudo actualizar el lote");
  }

  return addLotStatus(updatedLot, lotUsage);
}

export type DeleteProductLotInput = {
  orgSlug: string;
  productId: string;
  lotId: string;
};

export async function deleteProductLotForOrg(
  input: DeleteProductLotInput
): Promise<void> {
  const { orgSlug, productId, lotId } = input;

  if (!lotId) {
    throw new Error("El lote es requerido");
  }

  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data: lot, error: lotError } = await supabase
    .from("product_lots")
    .select("id, product_id")
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

  const lotMovements = await fetchLotMovements(supabase, org.id, lotId);
  const lotUsage =
    summarizeLotMovementUsage(lotMovements).get(lotId) ??
    buildEmptyLotMovementUsage();

  if (lotUsage.hasSalesReferences) {
    throw new Error(
      "No se puede eliminar el lote porque ya fue usado en ventas."
    );
  }

  const hasNonInboundMovements = lotMovements.some(
    (movement) => movement.type !== "INBOUND"
  );

  if (hasNonInboundMovements) {
    throw new Error(
      "No se puede eliminar el lote porque ya tiene salidas o ajustes de stock registrados."
    );
  }

  if (lotMovements.length > 0) {
    const { error: deleteMovementsError } = await supabase
      .from("stock_movements")
      .delete()
      .eq("organization_id", org.id)
      .eq("lot_id", lotId);

    if (deleteMovementsError) {
      throw new Error(
        `No se pudieron eliminar los movimientos del lote: ${deleteMovementsError.message}`
      );
    }
  }

  const { error: deleteError } = await supabase
    .from("product_lots")
    .delete()
    .eq("id", lotId)
    .eq("organization_id", org.id);

  if (deleteError) {
    if (deleteError.message.toLowerCase().includes("foreign key")) {
      throw new Error(
        "No se puede eliminar el lote porque tiene referencias de stock asociadas."
      );
    }

    throw new Error(`No se pudo eliminar el lote: ${deleteError.message}`);
  }
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

/**
 * Gets active organization products with current cost for the direct sale price template.
 */
export async function getDirectSaleTemplateProductsByOrgSlug(
  orgSlug: string
): Promise<DirectSaleTemplateProduct[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("products_with_price")
    .select("id, sku, name, cost_price")
    .eq("organization_id", org.id)
    .eq("is_active", true)
    .order("name");

  if (error) {
    throw new Error(`Error al obtener productos: ${error.message}`);
  }

  return (data ?? [])
    .filter((product) => product.id && product.sku && product.name)
    .map((product) => ({
      id: product.id as string,
      sku: product.sku as string,
      name: product.name as string,
      costPrice: product.cost_price ?? null,
    }));
}

export type ProductVariantRow = {
  id: string;
  talle: string;
  color: string;
  lotId: string | null;
  stock: number;
};

export async function getProductVariantsByProductId(
  orgSlug: string,
  productId: string
): Promise<ProductVariantRow[]> {
  const supabase = await createClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", orgSlug)
    .single();

  if (!org) {
    throw new Error("Organización no encontrada");
  }

  const { data, error } = await supabase
    .from("product_variants")
    .select("id, talle, color, lot_id, product_lots(quantity_available)")
    .eq("organization_id", org.id)
    .eq("product_id", productId)
    .eq("is_active", true)
    .order("talle")
    .order("color");

  if (error) {
    throw new Error(`Error al obtener variantes: ${error.message}`);
  }

  return (data ?? []).map((v) => ({
    id: v.id,
    talle: v.talle,
    color: v.color,
    lotId: v.lot_id,
    stock:
      (
        v.product_lots as unknown as {
          quantity_available: number;
        } | null
      )?.quantity_available ?? 0,
  }));
}

/**
 * Gets the current stock for a single variant by looking up its lot.
 */
export async function getVariantCurrentStock(
  variantId: string
): Promise<{ productId: string; currentStock: number }> {
  const supabase = await createClient();

  const { data: variant, error } = await supabase
    .from("product_variants")
    .select("product_id, product_lots(quantity_available)")
    .eq("id", variantId)
    .single();

  if (error || !variant) {
    throw new Error(
      `Error obteniendo la variante: ${error?.message ?? "No encontrada"}`
    );
  }

  const currentStock =
    (
      variant.product_lots as unknown as {
        quantity_available: number;
      } | null
    )?.quantity_available ?? 0;

  return { productId: variant.product_id, currentStock };
}

/**
 * Syncs the variant combinations (talles x colores) for an existing product.
 * Creates new variants with DEFAULT lots, deactivates removed ones,
 * and reactivates previously deactivated variants whose combination is back.
 */
export async function updateProductVariantsForOrg(
  orgSlug: string,
  productId: string,
  talles: string[],
  colores: string[]
): Promise<void> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data: existing, error: fetchError } = await supabase
    .from("product_variants")
    .select("id, talle, color, is_active")
    .eq("organization_id", org.id)
    .eq("product_id", productId);

  if (fetchError) {
    throw new Error(`Error al obtener variantes: ${fetchError.message}`);
  }

  const allVariants = existing ?? [];
  const active = allVariants.filter((v) => v.is_active);
  const inactive = allVariants.filter((v) => !v.is_active);

  const desiredKeys = new Set(
    talles.flatMap((t) => colores.map((c) => `${t}__${c}`))
  );

  const idsToReactivate = inactive
    .filter((v) => desiredKeys.has(`${v.talle}__${v.color}`))
    .map((v) => v.id);

  const idsToDeactivate = active
    .filter((v) => !desiredKeys.has(`${v.talle}__${v.color}`))
    .map((v) => v.id);

  const existingKeys = new Set(
    allVariants.map((v) => `${v.talle}__${v.color}`)
  );

  const newCombinations = talles.flatMap((talle) =>
    colores
      .filter((color) => !existingKeys.has(`${talle}__${color}`))
      .map((color) => ({ talle, color }))
  );

  if (idsToReactivate.length > 0) {
    const { error: reactivateError } = await supabase
      .from("product_variants")
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .in("id", idsToReactivate);

    if (reactivateError) {
      throw new Error(
        `Error al reactivar variantes: ${reactivateError.message}`
      );
    }
  }

  if (idsToDeactivate.length > 0) {
    const { error: deactivateError } = await supabase
      .from("product_variants")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .in("id", idsToDeactivate);

    if (deactivateError) {
      throw new Error(
        `Error al desactivar variantes: ${deactivateError.message}`
      );
    }
  }

  for (const { talle, color } of newCombinations) {
    const { data: lot, error: lotError } = await supabase
      .from("product_lots")
      .insert({
        organization_id: org.id,
        product_id: productId,
        lot_number: "DEFAULT",
        quantity_available: 0,
        unit_quantity_available: 0,
      })
      .select("id")
      .single();

    if (lotError || !lot) {
      throw new Error(`Error al crear lote DEFAULT: ${lotError?.message}`);
    }

    const { error: insertError } = await supabase
      .from("product_variants")
      .insert({
        organization_id: org.id,
        product_id: productId,
        talle,
        color,
        lot_id: lot.id,
      });

    if (insertError) {
      throw new Error(`Error al insertar variante: ${insertError.message}`);
    }
  }
}

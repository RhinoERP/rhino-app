"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { normalizeData, parseExcelFile } from "@/lib/excel-parser";
import { createClient } from "@/lib/supabase/server";
import { createProductForOrg } from "@/modules/inventory/service/inventory.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { createHistoricalDebts } from "@/modules/sales/service/historical-debt.service";
import type { Database } from "@/types/supabase";

type ImportResult = {
  success: boolean;
  message: string;
  imported?: number;
  errors?: string[];
};

type Category = { id: string; name: string };
type Supplier = { id: string; name: string };
const DDMMYYYY_REGEX = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const YYYYMMDD_REGEX = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const NUMERIC_STRING_REGEX = /^\d+(\.\d+)?$/;
const UNIT_MAP: Record<
  string,
  Database["public"]["Enums"]["unit_of_measure_type"]
> = {
  // Unidades
  UN: "UN",
  U: "UN",
  UNIDAD: "UN",
  UNIDADES: "UN",
  // Kilos
  KG: "KG",
  KGS: "KG",
  KILO: "KG",
  KILOS: "KG",
  KILOGRAMO: "KG",
  KILOGRAMOS: "KG",
  // Litros
  LT: "LT",
  LTS: "LT",
  L: "LT",
  LITRO: "LT",
  LITROS: "LT",
};

function toIsoDateString(date: Date): string | null {
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseExcelSerialDate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial <= 0) {
    return null;
  }
  const excelEpoch = Date.UTC(1899, 11, 30);
  const millis = Math.round(serial * 86_400_000);
  return toIsoDateString(new Date(excelEpoch + millis));
}

function getRequiredColumnErrorMessage(columnName: string, rowIndex: number) {
  return `La columna '${columnName}' es obligatoria y está vacía en la fila ${rowIndex + 3}.`;
}

function findCategoryId(
  categoryName: string | undefined,
  categories: Category[] | null
): string | undefined {
  if (!categoryName || typeof categoryName !== "string") {
    return;
  }
  const normalizedName = categoryName.trim().toLowerCase();
  return categories?.find(
    (cat) => cat.name.trim().toLowerCase() === normalizedName
  )?.id;
}

function findSupplierId(
  supplierName: string | undefined,
  suppliers: Supplier[] | null
): string | undefined {
  if (!supplierName || typeof supplierName !== "string") {
    return;
  }
  const normalizedName = supplierName.trim().toLowerCase();
  return suppliers?.find(
    (sup) => sup.name.trim().toLowerCase() === normalizedName
  )?.id;
}

function parseNumericField(value: unknown): number | undefined {
  if (value === null || value === undefined) {
    return;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  let normalized = String(value).trim();
  if (!normalized) {
    return;
  }

  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = normalized.replace(",", ".");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isEmptyField(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value === "string") {
    return value.trim().length === 0;
  }

  return false;
}

function normalizeBarcodeKey(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized ? normalized : null;
}

function getUnitOfMeasure(
  unit: unknown
): Database["public"]["Enums"]["unit_of_measure_type"] {
  if (!unit) {
    return "UN";
  }

  const sanitizedUnit = String(unit)
    .toUpperCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return UNIT_MAP[sanitizedUnit] || "UN";
}

type ProcessProductRowOptions = {
  row: Record<string, unknown>;
  index: number;
  orgSlug: string;
  categories: Category[] | null;
  suppliers: Supplier[] | null;
  existingCombinations: Set<string>;
  existingBarcodes: Set<string>;
  importingCombinations: Set<string>;
  importingBarcodes: Set<string>;
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: merges row-level import validations for SKU, barcode, and pricing in one place.
async function processProductRow(
  options: ProcessProductRowOptions
): Promise<{ success: boolean; error?: string }> {
  const {
    row,
    index,
    orgSlug,
    categories,
    suppliers,
    existingCombinations,
    existingBarcodes,
    importingCombinations,
    importingBarcodes,
  } = options;
  if (!row.name) {
    return {
      success: false,
      error: getRequiredColumnErrorMessage("Nombre", index),
    };
  }

  if (!row.sku) {
    return {
      success: false,
      error: getRequiredColumnErrorMessage("Código SKU", index),
    };
  }

  const category_id = findCategoryId(
    row.category as string | undefined,
    categories
  );
  const supplier_id = findSupplierId(
    row.supplier as string | undefined,
    suppliers
  );

  const skuLower = String(row.sku).toLowerCase();
  const combinationKey = `${supplier_id || "null"}:${skuLower}`;

  if (existingCombinations.has(combinationKey)) {
    return {
      success: false,
      error: `Fila ${index + 3}: SKU "${row.sku}" ya existe en la base de datos`,
    };
  }

  if (importingCombinations.has(combinationKey)) {
    return {
      success: false,
      error: `Fila ${index + 3}: SKU "${row.sku}" está duplicado en este archivo`,
    };
  }

  const rawBarcode = row.barcode;
  const resolvedBarcode =
    normalizeBarcodeKey(rawBarcode) ?? normalizeBarcodeKey(row.sku);

  if (!resolvedBarcode) {
    return {
      success: false,
      error: `Fila ${index + 3}: No se pudo resolver un código de barras válido.`,
    };
  }

  if (existingBarcodes.has(resolvedBarcode)) {
    return {
      success: false,
      error: `Fila ${index + 3}: Código de barras "${resolvedBarcode}" ya existe en la base de datos`,
    };
  }

  if (importingBarcodes.has(resolvedBarcode)) {
    return {
      success: false,
      error: `Fila ${index + 3}: Código de barras "${resolvedBarcode}" está duplicado en este archivo`,
    };
  }

  const rawProfitMargin = row.profit_margin;
  const parsedProfitMargin = parseNumericField(rawProfitMargin);
  const profitMarginIsEmpty = isEmptyField(rawProfitMargin);

  if (!profitMarginIsEmpty && parsedProfitMargin === undefined) {
    return {
      success: false,
      error: `Fila ${index + 3}: El margen de ganancia no es válido`,
    };
  }

  const profit_margin = profitMarginIsEmpty ? 0 : parsedProfitMargin;
  if (typeof profit_margin === "number" && profit_margin < 0) {
    return {
      success: false,
      error: `Fila ${index + 3}: El margen debe ser mayor o igual a 0`,
    };
  }
  const units_per_box = parseNumericField(row.units_per_box);
  const boxes_per_pallet = parseNumericField(row.boxes_per_pallet);
  const weight_per_unit = parseNumericField(row.weight_per_unit);
  const unit_of_measure = getUnitOfMeasure(row.unit);

  await createProductForOrg({
    orgSlug,
    name: String(row.name),
    sku: String(row.sku),
    barcode:
      rawBarcode === undefined || rawBarcode === null
        ? undefined
        : String(rawBarcode),
    description: row.description ? String(row.description) : undefined,
    brand: row.brand ? String(row.brand) : undefined,
    profit_margin,
    category_id,
    supplier_id,
    unit_of_measure,
    units_per_box,
    boxes_per_pallet,
    weight_per_unit,
  });

  importingCombinations.add(combinationKey);
  importingBarcodes.add(resolvedBarcode);
  return { success: true };
}

async function prepareProductImportData(orgId: string) {
  const supabase = await createClient();

  const [categoriesResult, suppliersResult, productsResult] = await Promise.all(
    [
      supabase
        .from("categories")
        .select("id, name")
        .eq("organization_id", orgId),
      supabase
        .from("suppliers")
        .select("id, name")
        .eq("organization_id", orgId),
      supabase
        .from("products")
        .select("sku, supplier_id, barcode")
        .eq("organization_id", orgId),
    ]
  );

  const existingCombinations = new Set(
    productsResult.data?.map(
      (p) => `${p.supplier_id || "null"}:${p.sku.toLowerCase()}`
    ) || []
  );

  const existingBarcodes = new Set(
    (productsResult.data ?? [])
      .map((product) => normalizeBarcodeKey(product.barcode))
      .filter((barcode): barcode is string => Boolean(barcode))
  );

  return {
    categories: categoriesResult.data,
    suppliers: suppliersResult.data,
    existingCombinations,
    existingBarcodes,
  };
}

type ProcessProductRowsOptions = {
  normalizedData: Record<string, unknown>[];
  orgSlug: string;
  categories: Category[] | null;
  suppliers: Supplier[] | null;
  existingCombinations: Set<string>;
  existingBarcodes: Set<string>;
};

async function processProductRows(options: ProcessProductRowsOptions) {
  const {
    normalizedData,
    orgSlug,
    categories,
    suppliers,
    existingCombinations,
    existingBarcodes,
  } = options;
  const importingCombinations = new Set<string>();
  const importingBarcodes = new Set<string>();
  const errors: string[] = [];
  const skipped: string[] = [];
  let imported = 0;

  for (const [index, row] of normalizedData.entries()) {
    try {
      const result = await processProductRow({
        row,
        index,
        orgSlug,
        categories,
        suppliers,
        existingCombinations,
        existingBarcodes,
        importingCombinations,
        importingBarcodes,
      });

      if (!result.success) {
        if (result.error) {
          skipped.push(result.error);
        }
        continue;
      }

      imported += 1;
    } catch (error) {
      errors.push(
        `Fila ${index + 3}: ${error instanceof Error ? error.message : "Error desconocido"}`
      );
    }
  }

  return { imported, errors, skipped };
}

/**
 * Server action to import products from Excel file
 */
export async function importProducts(
  formData: FormData,
  orgSlug: string
): Promise<ImportResult> {
  try {
    const file = formData.get("file") as File;

    if (!file) {
      return { success: false, message: "No se recibió ningún archivo" };
    }

    const parseResult = await parseExcelFile(file);
    if (!(parseResult.success && parseResult.data)) {
      return {
        success: false,
        message: parseResult.error || "Error al procesar el archivo",
      };
    }

    const normalizedData = normalizeData(parseResult.data);
    const org = await getOrganizationBySlug(orgSlug);
    if (!org?.id) {
      return { success: false, message: "Organización no encontrada" };
    }

    const { categories, suppliers, existingCombinations, existingBarcodes } =
      await prepareProductImportData(org.id);

    const { imported, errors, skipped } = await processProductRows({
      normalizedData,
      orgSlug,
      categories,
      suppliers,
      existingCombinations,
      existingBarcodes,
    });

    revalidatePath(`/org/${orgSlug}/products`);
    return {
      success: true,
      message: `Se importaron ${imported} productos`,
      imported,
      errors: [...errors, ...skipped],
    };
  } catch (_error) {
    return {
      success: false,
      message: "Error inesperado al importar productos",
    };
  }
}

type ProcessStockRowOptions = {
  row: Record<string, unknown>;
  index: number;
  orgId: string;
  suppliers: Supplier[] | null;
  supabase: Awaited<ReturnType<typeof createClient>>;
};

const parseNumberValue = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const normalized = String(value).trim();
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

type StockProduct = {
  id: string;
  unit_of_measure: Database["public"]["Enums"]["unit_of_measure_type"] | null;
  tracks_stock_units: boolean | null;
};

type StockQuantityDetails = {
  quantity: number | null;
  unitQuantity: number | null;
  unitQuantityValue: number | null;
  tracksUnits: boolean;
  error?: string;
};

function getStockRowRequiredError(
  row: Record<string, unknown>,
  index: number
): string | null {
  if (!row.sku) {
    return getRequiredColumnErrorMessage("SKU", index);
  }
  if (!row.supplier) {
    return getRequiredColumnErrorMessage("Proveedor", index);
  }
  if (!row.lot_number) {
    return getRequiredColumnErrorMessage("Número de lote", index);
  }
  if (!row.expiration_date) {
    return getRequiredColumnErrorMessage("Fecha de vencimiento", index);
  }
  return null;
}

function findSupplierByName(
  suppliers: Supplier[] | null,
  supplierValue: unknown
): Supplier | null {
  if (!suppliers) {
    return null;
  }
  const normalizedSupplier = String(supplierValue).trim().toLowerCase();
  return (
    suppliers.find(
      (supplier) => supplier.name.trim().toLowerCase() === normalizedSupplier
    ) ?? null
  );
}

async function getProductForStockRow(options: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  orgId: string;
  supplierId: string;
  sku: string;
  index: number;
}): Promise<{ product?: StockProduct; error?: string }> {
  const { supabase, orgId, supplierId, sku, index } = options;
  const { data: products, error } = await supabase
    .from("products")
    .select("id, unit_of_measure, tracks_stock_units")
    .eq("organization_id", orgId)
    .eq("supplier_id", supplierId)
    .ilike("sku", sku);

  if (error) {
    return {
      error: `Fila ${index + 3}: No se pudo validar el producto SKU "${sku}" (${error.message})`,
    };
  }

  if (!products || products.length !== 1) {
    return {
      error: `Fila ${index + 3}: Producto SKU "${sku}" no encontrado o ambiguo`,
    };
  }

  return { product: products[0] as StockProduct };
}

function getStockQuantityDetails(
  row: Record<string, unknown>,
  product: StockProduct,
  index: number
): StockQuantityDetails {
  const unitOfMeasure = product.unit_of_measure ?? "UN";
  const isUnitProduct = unitOfMeasure === "UN";
  const isWeightBased =
    unitOfMeasure === "KG" || unitOfMeasure === "LT" || unitOfMeasure === "MT";
  const tracksUnits =
    (unitOfMeasure === "KG" || unitOfMeasure === "LT") &&
    Boolean(product.tracks_stock_units);

  const quantityValue = parseNumberValue(row.quantity);
  const unitQuantityValue = parseNumberValue(
    row.unit_quantity ?? row.loose_units
  );

  const quantity =
    isUnitProduct && unitQuantityValue != null
      ? unitQuantityValue
      : quantityValue;

  if (isUnitProduct) {
    if (quantity == null) {
      return {
        quantity,
        unitQuantity: null,
        unitQuantityValue,
        tracksUnits,
        error: `Fila ${index + 3}: Falta cantidad en unidades`,
      };
    }
  } else if (isWeightBased && quantity == null) {
    return {
      quantity,
      unitQuantity: null,
      unitQuantityValue,
      tracksUnits,
      error: `Fila ${index + 3}: Falta cantidad en kg/lt`,
    };
  }

  return {
    quantity,
    unitQuantity: tracksUnits ? (unitQuantityValue ?? 0) : null,
    unitQuantityValue,
    tracksUnits,
  };
}

function normalizeExpirationDate(value: unknown): string {
  if (value instanceof Date) {
    const iso = toIsoDateString(value);
    if (iso) {
      return iso;
    }
    throw new Error("La fecha de vencimiento no es válida.");
  }

  if (typeof value === "number") {
    const serialDate = parseExcelSerialDate(value);
    if (serialDate) {
      return serialDate;
    }
    throw new Error("La fecha de vencimiento no es válida.");
  }

  const rawValue = String(value).trim();
  if (!rawValue) {
    throw new Error("La fecha de vencimiento no es válida.");
  }

  if (NUMERIC_STRING_REGEX.test(rawValue)) {
    const serialDate = parseExcelSerialDate(Number(rawValue));
    if (serialDate) {
      return serialDate;
    }
    throw new Error("La fecha de vencimiento no es válida.");
  }

  const ddmmyyyy = rawValue.match(DDMMYYYY_REGEX);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const yyyymmdd = rawValue.match(YYYYMMDD_REGEX);
  if (yyyymmdd) {
    const [, year, month, day] = yyyymmdd;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  throw new Error(
    "La fecha de vencimiento no es válida. Usá el formato DD/MM/AAAA."
  );
}

async function upsertProductLot(options: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  orgId: string;
  productId: string;
  lotNumber: string;
  quantity: number;
  expirationDate: string;
  tracksUnits: boolean;
  unitQuantity: number | null;
  unitQuantityValue: number | null;
}): Promise<{ imported: boolean }> {
  const {
    supabase,
    orgId,
    productId,
    lotNumber,
    quantity,
    expirationDate,
    tracksUnits,
    unitQuantity,
    unitQuantityValue,
  } = options;
  const { data: existingLots, error: existingLotsError } = await supabase
    .from("product_lots")
    .select("id, unit_quantity_available")
    .eq("product_id", productId)
    .eq("lot_number", lotNumber);

  if (existingLotsError) {
    throw new Error(
      `No se pudo consultar el lote existente: ${existingLotsError.message}`
    );
  }

  if (existingLots && existingLots.length > 0) {
    const existingLot = existingLots[0];
    const resolvedUnitQuantity =
      tracksUnits && unitQuantityValue == null
        ? (existingLot.unit_quantity_available ?? 0)
        : unitQuantity;
    const { error: updateError } = await supabase
      .from("product_lots")
      .update({
        quantity_available: quantity,
        unit_quantity_available: tracksUnits ? resolvedUnitQuantity : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingLot.id);

    if (updateError) {
      throw new Error(`No se pudo actualizar el lote: ${updateError.message}`);
    }

    return { imported: false };
  }

  const insertPayload: Database["public"]["Tables"]["product_lots"]["Insert"] =
    {
      organization_id: orgId,
      product_id: productId,
      lot_number: lotNumber,
      quantity_available: quantity,
      expiration_date: expirationDate,
    };

  if (tracksUnits) {
    insertPayload.unit_quantity_available = unitQuantity ?? 0;
  }

  const { error: insertError } = await supabase
    .from("product_lots")
    .insert(insertPayload);

  if (insertError) {
    throw new Error(`No se pudo crear el lote: ${insertError.message}`);
  }

  return { imported: true };
}

async function processStockRow(
  options: ProcessStockRowOptions
): Promise<{ success: boolean; imported: boolean; error?: string }> {
  const { row, index, orgId, suppliers, supabase } = options;
  const requiredError = getStockRowRequiredError(row, index);
  if (requiredError) {
    return { success: false, imported: false, error: requiredError };
  }

  const supplier = findSupplierByName(suppliers, row.supplier);
  if (!supplier) {
    return {
      success: false,
      imported: false,
      error: `Fila ${index + 3}: Proveedor "${row.supplier}" no encontrado`,
    };
  }

  const skuValue = String(row.sku).trim();
  const { product, error: productError } = await getProductForStockRow({
    supabase,
    orgId,
    supplierId: supplier.id,
    sku: skuValue,
    index,
  });

  if (!product) {
    return {
      success: false,
      imported: false,
      error: productError ?? `Fila ${index + 3}: Producto no encontrado`,
    };
  }

  const quantityDetails = getStockQuantityDetails(row, product, index);
  if (quantityDetails.error) {
    return {
      success: false,
      imported: false,
      error: quantityDetails.error,
    };
  }

  if (quantityDetails.quantity == null) {
    return {
      success: false,
      imported: false,
      error: `Fila ${index + 3}: Cantidad inválida`,
    };
  }

  const upsertResult = await upsertProductLot({
    supabase,
    orgId,
    productId: product.id,
    lotNumber: String(row.lot_number).trim(),
    quantity: quantityDetails.quantity,
    expirationDate: normalizeExpirationDate(row.expiration_date),
    tracksUnits: quantityDetails.tracksUnits,
    unitQuantity: quantityDetails.unitQuantity,
    unitQuantityValue: quantityDetails.unitQuantityValue,
  });

  return { success: true, imported: upsertResult.imported };
}

/**
 * Server action to import stock
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Stock import validates multiple per-row scenarios and aggregates final status.
export async function importStock(
  formData: FormData,
  orgSlug: string
): Promise<ImportResult> {
  try {
    const file = formData.get("file") as File;
    if (!file) {
      return { success: false, message: "No se recibió archivo" };
    }

    const parseResult = await parseExcelFile(file);
    if (!(parseResult.success && parseResult.data)) {
      return { success: false, message: "Error al procesar Excel" };
    }

    const normalizedData = normalizeData(parseResult.data);
    const org = await getOrganizationBySlug(orgSlug);
    if (!org?.id) {
      return { success: false, message: "Organización no encontrada" };
    }

    const supabase = await createClient();
    const { data: suppliers } = await supabase
      .from("suppliers")
      .select("id, name")
      .eq("organization_id", org.id);

    const errors: string[] = [];
    const warnings: string[] = [];
    let imported = 0;
    let updated = 0;

    for (const [index, row] of normalizedData.entries()) {
      try {
        const result = await processStockRow({
          row,
          index,
          orgId: org.id,
          suppliers,
          supabase,
        });

        if (!result.success) {
          if (result.error) {
            errors.push(result.error);
          }
          continue;
        }

        if (result.imported) {
          imported += 1;
        } else {
          updated += 1;
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Error inesperado";
        errors.push(`Fila ${index + 3}: ${message}`);
      }
    }

    const totalProcessed = imported + updated;

    revalidatePath(`/org/${orgSlug}/stock`);
    if (totalProcessed === 0 && errors.length > 0) {
      return {
        success: false,
        message: "No se importó ningún registro de stock. Revisá los errores.",
        imported: 0,
        errors: [...errors, ...warnings],
      };
    }

    return {
      success: true,
      message: `Stock actualizado: ${imported} nuevos, ${updated} actualizados`,
      imported: totalProcessed,
      errors: [...errors, ...warnings],
    };
  } catch (_err) {
    return { success: false, message: "Error crítico en importación de stock" };
  }
}

function getClientIdentity(
  cuit: string | null,
  bizName: string,
  fanName: string | null
): string {
  const cleanCuit = (cuit || "no-cuit").trim().toLowerCase();
  const cleanBiz = bizName.trim().toLowerCase();
  const cleanFan = (fanName || "").trim().toLowerCase();
  return `${cleanCuit}:${cleanBiz}:${cleanFan}`;
}

type CustomerLookup = { id: string; name: string };

type ProcessCustomerRowOptions = {
  row: Record<string, unknown>;
  index: number;
  orgId: string;
  existingKeys: Set<string>;
  importedInThisBatch: Set<string>;
  supabase: Awaited<ReturnType<typeof createClient>>;
  carriers: CustomerLookup[];
  sellers: CustomerLookup[];
};

type CustomerIdentityDetails = {
  identity: string;
  businessName: string;
  fantasyName: string | null;
};

function getCustomerIdentityDetails(
  row: Record<string, unknown>
): CustomerIdentityDetails | null {
  if (!row.business_name) {
    return null;
  }
  const businessName = String(row.business_name);
  const fantasyName = row.fantasy_name ? String(row.fantasy_name) : null;
  return {
    identity: getClientIdentity(
      row.cuit ? String(row.cuit) : null,
      businessName,
      fantasyName
    ),
    businessName,
    fantasyName,
  };
}

function findCarrierId(
  carrierName: string | undefined | null,
  carriers: CustomerLookup[]
): string | null {
  if (!carrierName) {
    return null;
  }
  const normalized = String(carrierName).trim().toLowerCase();
  return carriers.find((c) => c.name.toLowerCase() === normalized)?.id ?? null;
}

function findSellerId(
  sellerName: string | undefined | null,
  sellers: CustomerLookup[]
): string | null {
  if (!sellerName) {
    return null;
  }
  const normalized = String(sellerName).trim().toLowerCase();
  return sellers.find((s) => s.name.toLowerCase() === normalized)?.id ?? null;
}

function getDuplicateCustomerError(options: {
  index: number;
  row: Record<string, unknown>;
  identity: string;
  existingKeys: Set<string>;
  importedInThisBatch: Set<string>;
}): string | null {
  const { index, row, identity, existingKeys, importedInThisBatch } = options;
  if (existingKeys.has(identity)) {
    const fantasySuffix = row.fantasy_name ? ` - ${row.fantasy_name}` : "";
    return `Fila ${index + 3}: El cliente "${row.business_name}${fantasySuffix}" ya existe con el mismo CUIT.`;
  }
  if (importedInThisBatch.has(identity)) {
    return `Fila ${index + 3}: Registro idéntico duplicado dentro del archivo.`;
  }
  return null;
}

async function processCustomerRow(
  options: ProcessCustomerRowOptions
): Promise<{ success: boolean; error?: string }> {
  const {
    row,
    index,
    orgId,
    existingKeys,
    importedInThisBatch,
    supabase,
    carriers,
    sellers,
  } = options;
  const identityDetails = getCustomerIdentityDetails(row);
  if (!identityDetails) {
    return {
      success: false,
      error: getRequiredColumnErrorMessage("Razón social", index),
    };
  }

  const duplicateError = getDuplicateCustomerError({
    index,
    row,
    identity: identityDetails.identity,
    existingKeys,
    importedInThisBatch,
  });
  if (duplicateError) {
    return {
      success: false,
      error: duplicateError,
    };
  }

  const preferredCarrierId = findCarrierId(
    row.preferred_carrier as string | null,
    carriers
  );
  const assignedSellerId = findSellerId(row.seller as string | null, sellers);

  const { error: insertError } = await supabase.from("customers").insert({
    organization_id: orgId,
    client_number: row.client_number ? String(row.client_number).trim() : null,
    business_name: String(row.business_name).trim(),
    fantasy_name: row.fantasy_name ? String(row.fantasy_name).trim() : null,
    cuit: row.cuit ? String(row.cuit).trim() : null,
    email: row.email ? String(row.email).trim() : null,
    phone: row.phone ? String(row.phone).trim() : null,
    address: row.address ? String(row.address).trim() : null,
    city: row.city ? String(row.city).trim() : null,
    province: row.province ? String(row.province).trim() : null,
    tax_condition: row.tax_condition ? String(row.tax_condition).trim() : null,
    delivery_address: row.delivery_address
      ? String(row.delivery_address).trim()
      : null,
    delivery_city: row.delivery_city ? String(row.delivery_city).trim() : null,
    preferred_carrier_id: preferredCarrierId,
    assigned_seller_id: assignedSellerId,
  });

  if (insertError) {
    throw insertError;
  }

  importedInThisBatch.add(identityDetails.identity);
  return { success: true };
}

/**
 * Server action to import customers from Excel file
 */
export async function importCustomers(
  formData: FormData,
  orgSlug: string
): Promise<ImportResult> {
  try {
    const file = formData.get("file") as File;
    if (!file) {
      return { success: false, message: "No se recibió ningún archivo" };
    }

    const parseResult = await parseExcelFile(file);
    if (!(parseResult.success && parseResult.data)) {
      return { success: false, message: "Error al procesar el archivo" };
    }

    const normalizedData = normalizeData(parseResult.data);
    const org = await getOrganizationBySlug(orgSlug);
    if (!org?.id) {
      return { success: false, message: "Organización no encontrada" };
    }

    const supabase = await createClient();

    const [{ data: existingCustomers }, { data: carriersData }, membersData] =
      await Promise.all([
        supabase
          .from("customers")
          .select("cuit, business_name, fantasy_name")
          .eq("organization_id", org.id),
        supabase
          .from("carriers")
          .select("id, name")
          .eq("organization_id", org.id)
          .eq("is_active", true),
        supabase
          .rpc("get_organization_members_with_users", {
            org_slug_param: orgSlug,
          })
          .then((r) => r.data ?? []),
      ]);

    const carriers: CustomerLookup[] = (carriersData ?? []).map((c) => ({
      id: c.id,
      name: c.name,
    }));
    const sellers: CustomerLookup[] = membersData.map((m) => ({
      id: m.user_id,
      name: m.full_name,
    }));

    const existingKeys = new Set(
      existingCustomers?.map((c) =>
        getClientIdentity(c.cuit, c.business_name, c.fantasy_name)
      ) || []
    );

    const importedInThisBatch = new Set<string>();
    const errors: string[] = [];
    const skipped: string[] = [];
    let imported = 0;

    for (const [index, row] of normalizedData.entries()) {
      try {
        const result = await processCustomerRow({
          row,
          index,
          orgId: org.id,
          existingKeys,
          importedInThisBatch,
          supabase,
          carriers,
          sellers,
        });

        if (!result.success) {
          if (result.error) {
            skipped.push(result.error);
          }
          continue;
        }

        imported += 1;
      } catch (_error) {
        errors.push(`Fila ${index + 3}: Error técnico al insertar`);
      }
    }

    revalidatePath(`/org/${orgSlug}/customers`);
    return {
      success: true,
      message: `Proceso finalizado: ${imported} importados, ${skipped.length} omitidos por duplicidad.`,
      imported,
      errors: [...errors, ...skipped],
    };
  } catch (_error) {
    return { success: false, message: "Error inesperado en el servidor" };
  }
}

type ProcessSupplierRowOptions = {
  row: Record<string, unknown>;
  index: number;
  orgId: string;
  existingCombinations: Set<string>;
  supabase: Awaited<ReturnType<typeof createClient>>;
};

async function processSupplierRow(
  options: ProcessSupplierRowOptions
): Promise<{ success: boolean; error?: string }> {
  const { row, index, orgId, existingCombinations, supabase } = options;
  if (!row.name) {
    return {
      success: false,
      error: getRequiredColumnErrorMessage("Nombre", index),
    };
  }

  const nameLower = String(row.name).trim().toLowerCase();
  const cuitLower = row.cuit
    ? String(row.cuit).trim().toLowerCase()
    : "no-cuit";
  const combination = `${nameLower}:${cuitLower}`;

  if (existingCombinations.has(combination)) {
    return {
      success: false,
      error: `Fila ${index + 3}: El proveedor "${row.name}" ya existe.`,
    };
  }

  const { error: insertError } = await supabase.from("suppliers").insert({
    organization_id: orgId,
    name: String(row.name).trim(),
    cuit: row.cuit ? String(row.cuit).trim() : null,
    email: row.email ? String(row.email).trim() : null,
    phone: row.phone ? String(row.phone).trim() : null,
    address: row.address ? String(row.address).trim() : null,
    contact_name: row.contact_name ? String(row.contact_name).trim() : null,
    payment_terms: row.payment_terms ? String(row.payment_terms).trim() : null,
    notes: row.notes ? String(row.notes).trim() : null,
  });

  if (insertError) {
    throw insertError;
  }

  existingCombinations.add(combination);
  return { success: true };
}

/**
 * Server action to import suppliers from Excel file
 */
export async function importSuppliers(
  formData: FormData,
  orgSlug: string
): Promise<ImportResult> {
  try {
    const file = formData.get("file") as File;
    if (!file) {
      return { success: false, message: "No se recibió archivo" };
    }

    const parseResult = await parseExcelFile(file);
    if (!(parseResult.success && parseResult.data)) {
      return { success: false, message: "Error en Excel" };
    }

    const normalizedData = normalizeData(parseResult.data);
    const org = await getOrganizationBySlug(orgSlug);
    if (!org?.id) {
      return { success: false, message: "Organización no encontrada" };
    }

    const supabase = await createClient();
    const { data: existingSuppliers } = await supabase
      .from("suppliers")
      .select("name, cuit")
      .eq("organization_id", org.id);

    const existingCombinations = new Set(
      existingSuppliers?.map(
        (s) =>
          `${s.name.trim().toLowerCase()}:${(s.cuit || "no-cuit").trim().toLowerCase()}`
      ) || []
    );

    const errors: string[] = [];
    const skipped: string[] = [];
    let imported = 0;

    for (const [index, row] of normalizedData.entries()) {
      try {
        const result = await processSupplierRow({
          row,
          index,
          orgId: org.id,
          existingCombinations,
          supabase,
        });

        if (!result.success) {
          if (result.error) {
            skipped.push(result.error);
          }
          continue;
        }

        imported += 1;
      } catch (_error) {
        errors.push(`Fila ${index + 3}: Error inesperado`);
      }
    }

    revalidatePath(`/org/${orgSlug}/suppliers`);
    return {
      success: true,
      message: `Se importaron ${imported} proveedores`,
      imported,
      errors: [...errors, ...skipped],
    };
  } catch (_error) {
    return {
      success: false,
      message: "Error crítico en importación de proveedores",
    };
  }
}

type ProcessCarrierRowOptions = {
  row: Record<string, unknown>;
  index: number;
  orgId: string;
  existingNames: Set<string>;
  supabase: Awaited<ReturnType<typeof createClient>>;
};

async function processCarrierRow(
  options: ProcessCarrierRowOptions
): Promise<{ success: boolean; error?: string }> {
  const { row, index, orgId, existingNames, supabase } = options;

  if (!row.name) {
    return {
      success: false,
      error: getRequiredColumnErrorMessage("Nombre", index),
    };
  }

  const name = String(row.name).trim();
  if (existingNames.has(name.toLowerCase())) {
    return {
      success: false,
      error: `Fila ${index + 3}: El transportista "${name}" ya existe.`,
    };
  }

  const { error: insertError } = await supabase.from("carriers").insert({
    organization_id: orgId,
    name,
    phone: row.phone ? String(row.phone).trim() : null,
    email: row.email ? String(row.email).trim() : null,
  });

  if (insertError) {
    throw insertError;
  }

  existingNames.add(name.toLowerCase());
  return { success: true };
}

export async function importCarriers(
  formData: FormData,
  orgSlug: string
): Promise<ImportResult> {
  try {
    const file = formData.get("file") as File;
    if (!file) {
      return { success: false, message: "No se recibió archivo" };
    }

    const parseResult = await parseExcelFile(file);
    if (!(parseResult.success && parseResult.data)) {
      return { success: false, message: "Error en Excel" };
    }

    const normalizedData = normalizeData(parseResult.data);
    const org = await getOrganizationBySlug(orgSlug);
    if (!org?.id) {
      return { success: false, message: "Organización no encontrada" };
    }

    const supabase = await createClient();
    const { data: existingCarriers } = await supabase
      .from("carriers")
      .select("name")
      .eq("organization_id", org.id);

    const existingNames = new Set(
      existingCarriers?.map((c) => c.name.trim().toLowerCase()) ?? []
    );

    const errors: string[] = [];
    const skipped: string[] = [];
    let imported = 0;

    for (const [index, row] of normalizedData.entries()) {
      try {
        const result = await processCarrierRow({
          row,
          index,
          orgId: org.id,
          existingNames,
          supabase,
        });

        if (!result.success) {
          if (result.error) {
            skipped.push(result.error);
          }
          continue;
        }

        imported += 1;
      } catch (_error) {
        errors.push(`Fila ${index + 3}: Error inesperado`);
      }
    }

    revalidatePath(`/org/${orgSlug}/configuracion`);
    return {
      success: true,
      message: `Se importaron ${imported} transportistas`,
      imported,
      errors: [...errors, ...skipped],
    };
  } catch (_error) {
    return {
      success: false,
      message: "Error crítico en importación de transportistas",
    };
  }
}

/**
 * Customer-Supplier price lists assignment module
 */
type ValidAssignment = {
  customer_id: string;
  supplier_id: string;
  price_list_id: string | null;
  sales_price_list_id: string | null;
};

type ReferenceCustomer = {
  id: string;
  fantasy_name: string | null;
  business_name: string | null;
};
type ReferenceSupplier = { id: string; name: string };
type ReferencePurchaseList = {
  id: string;
  name: string;
  supplier_id: string | null;
};
type ReferenceSalesList = { id: string; name: string };

type ReferenceData = {
  customers: ReferenceCustomer[];
  suppliers: ReferenceSupplier[];
  purchasePriceLists: ReferencePurchaseList[];
  salesPriceLists: ReferenceSalesList[];
};

type ProcessAssignmentRowOptions = {
  row: Record<string, unknown>;
  index: number;
  refs: ReferenceData;
  errors: string[];
};

async function fetchAssignmentReferenceData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string
): Promise<ReferenceData> {
  const [
    { data: customers },
    { data: suppliers },
    { data: purchasePriceLists },
    { data: salesPriceLists },
  ] = await Promise.all([
    supabase
      .from("customers")
      .select("id, fantasy_name, business_name")
      .eq("organization_id", orgId),
    supabase.from("suppliers").select("id, name").eq("organization_id", orgId),
    supabase.from("price_lists").select("id, name, supplier_id"),
    supabase
      .from("sales_price_lists")
      .select("id, name")
      .eq("organization_id", orgId),
  ]);

  return {
    customers: (customers || []) as ReferenceCustomer[],
    suppliers: (suppliers || []) as ReferenceSupplier[],
    purchasePriceLists: (purchasePriceLists || []) as ReferencePurchaseList[],
    salesPriceLists: (salesPriceLists || []) as ReferenceSalesList[],
  };
}

function validateAssignmentRow(
  options: ProcessAssignmentRowOptions
): ValidAssignment | null {
  const { row, index, refs, errors } = options;

  const customerName = (row.customer as string)?.trim();
  if (!customerName) {
    errors.push(getRequiredColumnErrorMessage("Cliente", index));
    return null;
  }
  const customer = refs.customers.find(
    (c) =>
      c.fantasy_name?.trim().toLowerCase() === customerName.toLowerCase() ||
      c.business_name?.trim().toLowerCase() === customerName.toLowerCase()
  );
  if (!customer) {
    errors.push(`Fila ${index + 3}: Cliente '${customerName}' no encontrado.`);
    return null;
  }

  const supplierName = (row.supplier as string)?.trim();
  if (!supplierName) {
    errors.push(getRequiredColumnErrorMessage("Proveedor", index));
    return null;
  }
  const supplier = refs.suppliers.find(
    (s) => s.name.trim().toLowerCase() === supplierName.toLowerCase()
  );
  if (!supplier) {
    errors.push(
      `Fila ${index + 3}: Proveedor '${supplierName}' no encontrado.`
    );
    return null;
  }

  let priceListId: string | null = null;
  const purchaseListName = (row.purchase_price_list_name as string)?.trim();
  if (purchaseListName) {
    const priceList = refs.purchasePriceLists.find(
      (pl) =>
        pl.name.trim().toLowerCase() === purchaseListName.toLowerCase() &&
        pl.supplier_id === supplier.id
    );
    if (!priceList) {
      errors.push(
        `Fila ${index + 3}: Lista de precio compra '${purchaseListName}' no encontrada o no pertenece al proveedor.`
      );
      return null;
    }
    priceListId = priceList.id;
  }

  let salesPriceListId: string | null = null;
  const salesListName = (row.sales_price_list_name as string)?.trim();
  if (salesListName) {
    const salesPriceList = refs.salesPriceLists.find(
      (spl) => spl.name.trim().toLowerCase() === salesListName.toLowerCase()
    );
    if (!salesPriceList) {
      errors.push(
        `Fila ${index + 3}: Lista de precio venta '${salesListName}' no encontrada.`
      );
      return null;
    }
    salesPriceListId = salesPriceList.id;
  }

  return {
    customer_id: customer.id,
    supplier_id: supplier.id,
    price_list_id: priceListId,
    sales_price_list_id: salesPriceListId,
  };
}

export async function importCustomerSupplierAssignments(
  formData: FormData,
  orgSlug: string
): Promise<ImportResult> {
  try {
    const file = formData.get("file") as File;
    if (!file) {
      return { success: false, message: "No se recibió ningún archivo" };
    }

    const parseResult = await parseExcelFile(file);
    if (!(parseResult.success && parseResult.data)) {
      return {
        success: false,
        message: parseResult.error || "Error al procesar el archivo",
      };
    }

    const org = await getOrganizationBySlug(orgSlug);
    if (!org?.id) {
      return { success: false, message: "Organización no encontrada" };
    }

    const supabase = await createClient();
    const refs = await fetchAssignmentReferenceData(supabase, org.id);

    const normalizedData = normalizeData(parseResult.data);
    const errors: string[] = [];
    const validAssignments: ValidAssignment[] = [];

    for (const [index, row] of normalizedData.entries()) {
      try {
        const assignment = validateAssignmentRow({ row, index, refs, errors });
        if (assignment) {
          validAssignments.push(assignment);
        }
      } catch (_error) {
        errors.push(
          `Fila ${index + 3}: Error inesperado al procesar la asignación`
        );
      }
    }

    if (validAssignments.length > 0) {
      const { error } = await supabase
        .from("customer_supplier_assignments")
        .upsert(
          validAssignments.map((a) => ({
            ...a,
            organization_id: org.id,
            updated_at: new Date().toISOString(),
          })),
          { onConflict: "customer_id,supplier_id" }
        );

      if (error) {
        return {
          success: false,
          message: `Error al guardar asignaciones: ${error.message}`,
          errors,
        };
      }
    }

    revalidatePath(`/org/${orgSlug}/customers`);

    return {
      success: true,
      message: `Importación completada. ${validAssignments.length} asignaciones procesadas.`,
      imported: validAssignments.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (_error) {
    return {
      success: false,
      message: "Error crítico en importación de asignaciones",
    };
  }
}

type DebtEntry = {
  customerId: string;
  supplierId: string;
  totalAmount: number;
  saleDate: string;
  creditDays: number;
  observations?: string;
};

function validateInitialBalanceRow(
  row: Record<string, unknown>,
  index: number,
  customerList: Array<{
    id: string;
    fantasy_name: string | null;
    business_name: string | null;
  }>,
  supplierList: Array<{ id: string; name: string }>
): { debt?: DebtEntry; error?: string } {
  const customerName = String(row.customer ?? "").trim();
  if (!customerName) {
    return { error: getRequiredColumnErrorMessage("Cliente", index) };
  }
  const customer = customerList.find(
    (c) =>
      c.fantasy_name?.toLowerCase() === customerName.toLowerCase() ||
      c.business_name?.toLowerCase() === customerName.toLowerCase()
  );
  if (!customer) {
    return {
      error: `Fila ${index + 3}: Cliente '${customerName}' no encontrado.`,
    };
  }
  const supplierName = String(row.supplier ?? "").trim();
  if (!supplierName) {
    return { error: getRequiredColumnErrorMessage("Proveedor", index) };
  }
  const supplier = supplierList.find(
    (s) => s.name.toLowerCase() === supplierName.toLowerCase()
  );
  if (!supplier) {
    return {
      error: `Fila ${index + 3}: Proveedor '${supplierName}' no encontrado.`,
    };
  }
  const totalAmount = parseNumericField(row.total_amount);
  if (totalAmount === undefined || totalAmount <= 0) {
    return { error: `Fila ${index + 3}: Monto Total inválido.` };
  }
  const saleDate = String(row.sale_date ?? "").trim();
  if (!(saleDate && YYYYMMDD_REGEX.test(saleDate))) {
    return {
      error: `Fila ${index + 3}: Fecha de Venta inválida. Usá formato YYYY-MM-DD.`,
    };
  }
  const creditDays = parseNumericField(row.credit_days);
  if (creditDays === undefined || creditDays < 0) {
    return { error: `Fila ${index + 3}: Días de Crédito inválido.` };
  }
  return {
    debt: {
      customerId: customer.id,
      supplierId: supplier.id,
      totalAmount,
      saleDate,
      creditDays: Math.round(creditDays),
      observations: row.observations
        ? String(row.observations).trim()
        : undefined,
    },
  };
}

async function fetchReferenceData(
  supabase: SupabaseClient<Database>,
  orgId: string
) {
  const [{ data: customers }, { data: suppliers }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, fantasy_name, business_name")
      .eq("organization_id", orgId),
    supabase.from("suppliers").select("id, name").eq("organization_id", orgId),
  ]);

  return {
    customerList: customers ?? [],
    supplierList: suppliers ?? [],
  };
}

function processImportRows(
  normalizedData: Record<string, unknown>[],
  customerList: Array<{
    id: string;
    fantasy_name: string | null;
    business_name: string | null;
  }>,
  supplierList: Array<{ id: string; name: string }>
) {
  const debts: DebtEntry[] = [];
  const errors: string[] = [];

  for (const [index, row] of normalizedData.entries()) {
    const result = validateInitialBalanceRow(
      row,
      index,
      customerList,
      supplierList
    );
    if (result.error) {
      errors.push(result.error);
    } else if (result.debt) {
      debts.push(result.debt);
    }
  }

  return { debts, errors };
}

export async function importInitialBalances(
  formData: FormData,
  orgSlug: string
): Promise<ImportResult> {
  try {
    const file = formData.get("file") as File;
    if (!file) {
      return { success: false, message: "No se recibió ningún archivo" };
    }

    const parseResult = await parseExcelFile(file);
    if (!(parseResult.success && parseResult.data)) {
      return {
        success: false,
        message: parseResult.error || "Error al procesar el archivo",
      };
    }

    const org = await getOrganizationBySlug(orgSlug);
    if (!org?.id) {
      return { success: false, message: "Organización no encontrada" };
    }

    const supabase = await createClient(); // Asegurate de que retorne SupabaseClient<Database>

    const { customerList, supplierList } = await fetchReferenceData(
      supabase,
      org.id
    );

    const normalizedData = normalizeData(parseResult.data);
    const { debts, errors: rowErrors } = processImportRows(
      normalizedData,
      customerList,
      supplierList
    );

    if (debts.length === 0) {
      return {
        success: false,
        message: "No hay filas válidas para importar.",
        errors: rowErrors.length > 0 ? rowErrors : undefined,
      };
    }

    const result = await createHistoricalDebts({ orgSlug, debts });
    revalidatePath(`/org/${orgSlug}/cobranzas`);

    return {
      success: true,
      message: `Se importaron ${result.imported} saldos iniciales.`,
      imported: result.imported,
      errors: [...rowErrors, ...result.errors],
    };
  } catch (_error) {
    return {
      success: false,
      message: "Error inesperado al importar saldos iniciales",
    };
  }
}

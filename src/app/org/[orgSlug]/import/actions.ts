"use server";

import { revalidatePath } from "next/cache";
import { normalizeData, parseExcelFile } from "@/lib/excel-parser";
import { createClient } from "@/lib/supabase/server";
import { createProductForOrg } from "@/modules/inventory/service/inventory.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { Database } from "@/types/supabase";

type ImportResult = {
  success: boolean;
  message: string;
  imported?: number;
  errors?: string[];
};

type Category = { id: string; name: string };
type Supplier = { id: string; name: string };

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
  if (value && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return;
}

function getUnitOfMeasure(
  unit: unknown
): Database["public"]["Enums"]["unit_of_measure_type"] {
  const unitMap: Record<
    string,
    Database["public"]["Enums"]["unit_of_measure_type"]
  > = { UN: "UN", KG: "KG", LT: "LT" };
  return unitMap[String(unit || "").toUpperCase()] || "UN";
}

type ProcessProductRowOptions = {
  row: Record<string, unknown>;
  index: number;
  orgSlug: string;
  categories: Category[] | null;
  suppliers: Supplier[] | null;
  existingCombinations: Set<string>;
  importingCombinations: Set<string>;
};

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
    importingCombinations,
  } = options;
  if (!(row.name && row.sku)) {
    return {
      success: false,
      error: `Fila ${index + 3}: Falta nombre o SKU (campos obligatorios)`,
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

  const profit_margin = parseNumericField(row.profit_margin);
  const units_per_box = parseNumericField(row.units_per_box);
  const boxes_per_pallet = parseNumericField(row.boxes_per_pallet);
  const weight_per_unit = parseNumericField(row.weight_per_unit);
  const unit_of_measure = getUnitOfMeasure(row.unit);

  await createProductForOrg({
    orgSlug,
    name: String(row.name),
    sku: String(row.sku),
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
        .select("sku, supplier_id")
        .eq("organization_id", orgId),
    ]
  );

  const existingCombinations = new Set(
    productsResult.data?.map(
      (p) => `${p.supplier_id || "null"}:${p.sku.toLowerCase()}`
    ) || []
  );

  return {
    categories: categoriesResult.data,
    suppliers: suppliersResult.data,
    existingCombinations,
  };
}

type ProcessProductRowsOptions = {
  normalizedData: Record<string, unknown>[];
  orgSlug: string;
  categories: Category[] | null;
  suppliers: Supplier[] | null;
  existingCombinations: Set<string>;
};

async function processProductRows(options: ProcessProductRowsOptions) {
  const {
    normalizedData,
    orgSlug,
    categories,
    suppliers,
    existingCombinations,
  } = options;
  const importingCombinations = new Set<string>();
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
        importingCombinations,
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

    const { categories, suppliers, existingCombinations } =
      await prepareProductImportData(org.id);

    const { imported, errors, skipped } = await processProductRows({
      normalizedData,
      orgSlug,
      categories,
      suppliers,
      existingCombinations,
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

async function processStockRow(
  options: ProcessStockRowOptions
): Promise<{ success: boolean; imported: boolean; error?: string }> {
  const { row, index, orgId, suppliers, supabase } = options;
  if (
    !(
      row.sku &&
      row.supplier &&
      row.lot_number &&
      row.quantity &&
      row.expiration_date
    )
  ) {
    return {
      success: false,
      imported: false,
      error: `Fila ${index + 3}: Faltan campos obligatorios`,
    };
  }

  const supplier = suppliers?.find(
    (s) =>
      s.name.trim().toLowerCase() === String(row.supplier).trim().toLowerCase()
  );
  if (!supplier) {
    return {
      success: false,
      imported: false,
      error: `Fila ${index + 3}: Proveedor "${row.supplier}" no encontrado`,
    };
  }

  const { data: products } = await supabase
    .from("products")
    .select("id, units_per_box, unit_of_measure")
    .eq("organization_id", orgId)
    .eq("supplier_id", supplier.id)
    .ilike("sku", String(row.sku).trim());

  if (!products || products.length !== 1) {
    return {
      success: false,
      imported: false,
      error: `Fila ${index + 3}: Producto SKU "${row.sku}" no encontrado o ambiguo`,
    };
  }

  const product = products[0];
  const quantity = Number(row.quantity);
  const expirationDate =
    row.expiration_date instanceof Date
      ? row.expiration_date.toISOString().split("T")[0]
      : String(row.expiration_date);

  let unitQuantity: number | null = null;
  if (
    product.units_per_box &&
    product.units_per_box > 0 &&
    product.unit_of_measure !== "UN"
  ) {
    unitQuantity = quantity * product.units_per_box;
  }

  const { data: existingLots } = await supabase
    .from("product_lots")
    .select("id")
    .eq("product_id", product.id)
    .eq("lot_number", String(row.lot_number).trim());

  if (existingLots && existingLots.length > 0) {
    await supabase
      .from("product_lots")
      .update({
        quantity_available: quantity,
        unit_quantity_available: unitQuantity,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingLots[0].id);
    return { success: true, imported: false };
  }

  await supabase.from("product_lots").insert({
    organization_id: orgId,
    product_id: product.id,
    lot_number: String(row.lot_number).trim(),
    quantity_available: quantity,
    unit_quantity_available: unitQuantity,
    expiration_date: expirationDate,
  });
  return { success: true, imported: true };
}

/**
 * Server action to import stock
 */
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
      } catch (_error) {
        errors.push(`Fila ${index + 3}: Error inesperado`);
      }
    }

    revalidatePath(`/org/${orgSlug}/stock`);
    return {
      success: true,
      message: `Stock actualizado: ${imported} nuevos, ${updated} actualizados`,
      imported: imported + updated,
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

type ProcessCustomerRowOptions = {
  row: Record<string, unknown>;
  index: number;
  orgId: string;
  existingKeys: Set<string>;
  importedInThisBatch: Set<string>;
  supabase: Awaited<ReturnType<typeof createClient>>;
};

async function processCustomerRow(
  options: ProcessCustomerRowOptions
): Promise<{ success: boolean; error?: string }> {
  const { row, index, orgId, existingKeys, importedInThisBatch, supabase } =
    options;
  if (!row.business_name) {
    return {
      success: false,
      error: `Fila ${index + 3}: Falta la Razón Social`,
    };
  }

  const currentIdentity = getClientIdentity(
    row.cuit ? String(row.cuit) : null,
    String(row.business_name),
    row.fantasy_name ? String(row.fantasy_name) : null
  );

  if (existingKeys.has(currentIdentity)) {
    return {
      success: false,
      error: `Fila ${index + 3}: El cliente "${row.business_name}${row.fantasy_name ? ` - ${row.fantasy_name}` : ""}" ya existe con el mismo CUIT.`,
    };
  }

  if (importedInThisBatch.has(currentIdentity)) {
    return {
      success: false,
      error: `Fila ${index + 3}: Registro idéntico duplicado dentro del archivo.`,
    };
  }

  const { error: insertError } = await supabase.from("customers").insert({
    organization_id: orgId,
    business_name: String(row.business_name).trim(),
    fantasy_name: row.fantasy_name ? String(row.fantasy_name).trim() : null,
    cuit: row.cuit ? String(row.cuit).trim() : null,
    email: row.email ? String(row.email).trim() : null,
    phone: row.phone ? String(row.phone).trim() : null,
    address: row.address ? String(row.address).trim() : null,
    city: row.city ? String(row.city).trim() : null,
    tax_condition: row.tax_condition ? String(row.tax_condition).trim() : null,
  });

  if (insertError) {
    throw insertError;
  }

  importedInThisBatch.add(currentIdentity);
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

    const { data: existingCustomers } = await supabase
      .from("customers")
      .select("cuit, business_name, fantasy_name")
      .eq("organization_id", org.id);

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
      error: `Fila ${index + 3}: Falta nombre`,
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

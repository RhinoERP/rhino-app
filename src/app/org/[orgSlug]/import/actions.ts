"use server";

import { revalidatePath } from "next/cache";
import { normalizeData, parseExcelFile } from "@/lib/excel-parser";
import { createClient } from "@/lib/supabase/server";
import { createProductForOrg } from "@/modules/inventory/service/inventory.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { Database } from "@/types/supabase";

// Date parsing regex patterns
const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})/;
const DD_MM_YYYY_DATE_REGEX = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/;

type ImportResult = {
  success: boolean;
  message: string;
  imported?: number;
  errors?: string[];
};

/**
 * Server action to import products from Excel file
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Import function requires multiple validations and transformations
export async function importProducts(
  formData: FormData,
  orgSlug: string
): Promise<ImportResult> {
  try {
    const file = formData.get("file") as File;

    if (!file) {
      return {
        success: false,
        message: "No se recibió ningún archivo",
      };
    }

    // Parse Excel file
    const parseResult = await parseExcelFile(file);

    if (!(parseResult.success && parseResult.data)) {
      return {
        success: false,
        message: parseResult.error || "Error al procesar el archivo",
      };
    }

    // Normalize data (Spanish headers → DB columns)
    const normalizedData = normalizeData(parseResult.data);

    // Get organization
    const org = await getOrganizationBySlug(orgSlug);
    if (!org?.id) {
      return {
        success: false,
        message: "Organización no encontrada",
      };
    }

    // Get supabase client for lookups
    const supabase = await createClient();

    // Get all categories and suppliers for lookups
    const { data: categories } = await supabase
      .from("categories")
      .select("id, name")
      .eq("organization_id", org.id);

    const { data: suppliers } = await supabase
      .from("suppliers")
      .select("id, name")
      .eq("organization_id", org.id);

    // Get existing products to check for duplicate SKUs (organization_id + supplier_id + sku)
    const { data: existingProducts } = await supabase
      .from("products")
      .select("sku, supplier_id")
      .eq("organization_id", org.id);

    // Create a Set of "supplier_id:sku" combinations for quick lookup
    const existingCombinations = new Set(
      existingProducts?.map(
        (p) => `${p.supplier_id || "null"}:${p.sku.toLowerCase()}`
      ) || []
    );

    // Track combinations being imported in this batch to detect duplicates within the file
    const importingCombinations = new Set<string>();

    // Validate and import products
    const errors: string[] = [];
    const skipped: string[] = [];
    let imported = 0;

    for (const [index, row] of normalizedData.entries()) {
      try {
        // Validate required fields
        if (!(row.name && row.sku)) {
          errors.push(
            `Fila ${index + 3}: Falta nombre o SKU (campos obligatorios)`
          );
          continue;
        }

        // Lookup category by name if provided
        let category_id: string | undefined;
        if (row.category && typeof row.category === "string") {
          const categoryName = String(row.category).trim().toLowerCase();
          const category = categories?.find(
            (cat) => cat.name.trim().toLowerCase() === categoryName
          );
          category_id = category?.id;
        }

        // Lookup supplier by name if provided
        let supplier_id: string | undefined;
        if (row.supplier && typeof row.supplier === "string") {
          const supplierName = String(row.supplier).trim().toLowerCase();
          const supplier = suppliers?.find(
            (sup) => sup.name.trim().toLowerCase() === supplierName
          );
          supplier_id = supplier?.id;
        }

        // Check for duplicate combination (organization + supplier + SKU)
        const skuLower = String(row.sku).toLowerCase();
        const combinationKey = `${supplier_id || "null"}:${skuLower}`;

        // Check if already exists in database
        if (existingCombinations.has(combinationKey)) {
          const supplierName = row.supplier
            ? `del proveedor "${row.supplier}"`
            : "sin proveedor";
          skipped.push(
            `Fila ${index + 3}: SKU "${row.sku}" ${supplierName} ya existe en la base de datos`
          );
          continue;
        }

        // Check if it's a duplicate within this import file
        if (importingCombinations.has(combinationKey)) {
          const supplierName = row.supplier
            ? `del proveedor "${row.supplier}"`
            : "sin proveedor";
          skipped.push(
            `Fila ${index + 3}: SKU "${row.sku}" ${supplierName} está duplicado en este archivo (aparece más de una vez)`
          );
          continue;
        }

        // Parse profit margin
        const profit_margin =
          row.profit_margin && !Number.isNaN(Number(row.profit_margin))
            ? Number(row.profit_margin)
            : undefined;

        // Parse numeric fields
        const units_per_box =
          row.units_per_box && !Number.isNaN(Number(row.units_per_box))
            ? Number(row.units_per_box)
            : undefined;

        const boxes_per_pallet =
          row.boxes_per_pallet && !Number.isNaN(Number(row.boxes_per_pallet))
            ? Number(row.boxes_per_pallet)
            : undefined;

        const weight_per_unit =
          row.weight_per_unit && !Number.isNaN(Number(row.weight_per_unit))
            ? Number(row.weight_per_unit)
            : undefined;

        // Map unit of measure (default to UN if not provided or invalid)
        const unitMap: Record<
          string,
          Database["public"]["Enums"]["unit_of_measure_type"]
        > = {
          UN: "UN",
          KG: "KG",
          LT: "LT",
        };
        const unit_of_measure =
          unitMap[String(row.unit || "").toUpperCase()] || "UN";

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

        // Mark this combination as imported to detect duplicates within the file
        importingCombinations.add(combinationKey);
        imported += 1;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Error desconocido";
        errors.push(`Fila ${index + 3}: ${errorMessage}`);
      }
    }

    // Revalidate products page
    revalidatePath(`/org/${orgSlug}/products`);
    revalidatePath(`/org/${orgSlug}/stock`);

    // Build result message
    let message = `Se importaron ${imported} de ${normalizedData.length} productos`;
    if (skipped.length > 0) {
      message += `. ${skipped.length} productos se saltaron por SKU duplicado`;
    }

    // Combine errors and skipped for detailed reporting
    const allIssues = [...errors, ...skipped];

    return {
      success: true,
      message,
      imported,
      errors: allIssues.length > 0 ? allIssues : undefined,
    };
  } catch (_error) {
    return {
      success: false,
      message: "Error inesperado al importar productos",
    };
  }
}

/**
 * Server action to import stock from Excel file
 * Requires: SKU, Proveedor (supplier), Lote (lot number), Cantidad (quantity), Fecha de Expiración (expiration date)
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Import function requires multiple validations and transformations
export async function importStock(
  formData: FormData,
  orgSlug: string
): Promise<ImportResult> {
  try {
    const file = formData.get("file") as File;

    if (!file) {
      return {
        success: false,
        message: "No se recibió ningún archivo",
      };
    }

    const parseResult = await parseExcelFile(file);

    if (!(parseResult.success && parseResult.data)) {
      return {
        success: false,
        message: parseResult.error || "Error al procesar el archivo",
      };
    }

    const normalizedData = normalizeData(parseResult.data);

    console.log("📊 Stock import - Data preview:");
    console.log("  Total rows:", normalizedData.length);
    if (normalizedData.length > 0) {
      console.log("  First row keys:", Object.keys(normalizedData[0]));
      console.log("  First row data:", normalizedData[0]);
    }

    // Get organization
    const org = await getOrganizationBySlug(orgSlug);
    if (!org?.id) {
      return {
        success: false,
        message: "Organización no encontrada",
      };
    }

    // Get supabase client for lookups
    const supabase = await createClient();

    // Get all suppliers for lookups
    const { data: suppliers } = await supabase
      .from("suppliers")
      .select("id, name")
      .eq("organization_id", org.id);

    console.log(
      "🚚 Proveedores disponibles:",
      suppliers?.map((s) => s.name) || []
    );

    const errors: string[] = [];
    const warnings: string[] = [];
    let imported = 0;
    let updated = 0;

    for (const [index, row] of normalizedData.entries()) {
      try {
        // Validate required fields
        const missingFields: string[] = [];
        if (!row.sku) {
          missingFields.push("SKU");
        }
        if (!row.supplier) {
          missingFields.push("Proveedor");
        }
        if (!row.lot_number) {
          missingFields.push("Lote");
        }
        if (!row.quantity) {
          missingFields.push("Cantidad");
        }

        if (missingFields.length > 0) {
          errors.push(
            `Fila ${index + 3}: Faltan campos obligatorios: ${missingFields.join(", ")}`
          );
          continue;
        }

        // Validate expiration date
        if (!row.expiration_date) {
          errors.push(
            `Fila ${index + 3}: Falta la fecha de expiración (campo obligatorio)`
          );
          continue;
        }

        // Lookup supplier by name
        const supplierName = String(row.supplier).trim().toLowerCase();
        const supplier = suppliers?.find(
          (sup) => sup.name.trim().toLowerCase() === supplierName
        );

        if (!supplier) {
          errors.push(
            `Fila ${index + 3}: Proveedor "${row.supplier}" no encontrado. El proveedor debe existir en la base de datos.`
          );
          continue;
        }

        // Lookup product by (organization_id + supplier_id + sku)
        const { data: products, error: productError } = await supabase
          .from("products")
          .select("id, name, unit_of_measure, units_per_box")
          .eq("organization_id", org.id)
          .eq("supplier_id", supplier.id)
          .ilike("sku", String(row.sku).trim())
          .limit(2); // Limit to 2 to detect ambiguous cases

        if (productError) {
          errors.push(
            `Fila ${index + 3}: Error al buscar el producto en la base de datos`
          );
          continue;
        }

        if (!products || products.length === 0) {
          errors.push(
            `Fila ${index + 3}: Producto con SKU "${row.sku}" del proveedor "${row.supplier}" no encontrado. El producto debe existir antes de importar stock.`
          );
          continue;
        }

        if (products.length > 1) {
          errors.push(
            `Fila ${index + 3}: Se encontraron múltiples productos con SKU "${row.sku}" del proveedor "${row.supplier}". No se puede determinar cuál actualizar.`
          );
          continue;
        }

        const product = products[0];

        // Parse quantity
        const quantity = Number(row.quantity);
        if (Number.isNaN(quantity) || quantity < 0) {
          errors.push(
            `Fila ${index + 3}: Cantidad inválida "${row.quantity}". Debe ser un número mayor o igual a 0.`
          );
          continue;
        }

        // Parse expiration date (convert Excel serial to ISO date if needed)
        let expirationDate: string;
        if (typeof row.expiration_date === "number") {
          // Excel serial date (days since 1900-01-01)
          const excelEpoch = new Date(1900, 0, 1);
          const date = new Date(
            excelEpoch.getTime() + (row.expiration_date - 2) * 86_400_000
          );
          expirationDate = date.toISOString().split("T")[0];
        } else if (row.expiration_date instanceof Date) {
          expirationDate = row.expiration_date.toISOString().split("T")[0];
        } else {
          // Try to parse as string (ISO format or dd/mm/yyyy)
          const dateStr = String(row.expiration_date).trim();
          const isoMatch = ISO_DATE_REGEX.exec(dateStr);
          const ddmmyyyyMatch = DD_MM_YYYY_DATE_REGEX.exec(dateStr);

          if (isoMatch) {
            expirationDate = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
          } else if (ddmmyyyyMatch) {
            const day = ddmmyyyyMatch[1].padStart(2, "0");
            const month = ddmmyyyyMatch[2].padStart(2, "0");
            const year = ddmmyyyyMatch[3];
            expirationDate = `${year}-${month}-${day}`;
          } else {
            errors.push(
              `Fila ${index + 3}: Fecha de expiración inválida "${row.expiration_date}". Use formato YYYY-MM-DD o DD/MM/YYYY.`
            );
            continue;
          }
        }

        // Calculate unit quantity if units_per_box is available
        let unitQuantity: number | null = null;
        if (
          product.units_per_box &&
          product.units_per_box > 0 &&
          product.unit_of_measure !== "UN"
        ) {
          unitQuantity = quantity * product.units_per_box;
        }

        // Lookup or create product lot (batch) by (product_id + lot_number)
        const lotNumber = String(row.lot_number).trim();
        const { data: existingLots, error: lotLookupError } = await supabase
          .from("product_lots")
          .select("id, quantity_available, expiration_date")
          .eq("product_id", product.id)
          .eq("lot_number", lotNumber)
          .limit(1);

        if (lotLookupError) {
          console.error("Error looking up lot:", lotLookupError);
          errors.push(
            `Fila ${index + 3}: Error al buscar el lote en la base de datos`
          );
          continue;
        }

        if (existingLots && existingLots.length > 0) {
          // Update existing lot
          const existingLot = existingLots[0];

          // Check if expiration dates match
          if (existingLot.expiration_date !== expirationDate) {
            warnings.push(
              `Fila ${index + 3}: El lote "${lotNumber}" ya existe con fecha de expiración ${existingLot.expiration_date}, pero se intentó actualizar con ${expirationDate}. Se mantendrá la fecha original.`
            );
          }

          const { error: updateError } = await supabase
            .from("product_lots")
            .update({
              quantity_available: quantity,
              unit_quantity_available: unitQuantity,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingLot.id);

          if (updateError) {
            console.error("Error updating lot:", updateError);
            errors.push(`Fila ${index + 3}: Error al actualizar el lote`);
            continue;
          }

          updated += 1;
        } else {
          // Create new lot
          const { error: insertError } = await supabase
            .from("product_lots")
            .insert({
              organization_id: org.id,
              product_id: product.id,
              lot_number: lotNumber,
              quantity_available: quantity,
              unit_quantity_available: unitQuantity,
              expiration_date: expirationDate,
            });

          if (insertError) {
            errors.push(`Fila ${index + 3}: Error al crear el lote`);
            continue;
          }

          imported += 1;
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Error desconocido";
        errors.push(`Fila ${index + 3}: ${errorMessage}`);
      }
    }

    revalidatePath(`/org/${orgSlug}/inventory`);
    revalidatePath(`/org/${orgSlug}/stock`);

    // Build result message
    let message = "";
    if (imported > 0 && updated > 0) {
      message = `Se crearon ${imported} lotes nuevos y se actualizaron ${updated} lotes existentes de ${normalizedData.length} filas`;
    } else if (imported > 0) {
      message = `Se crearon ${imported} lotes nuevos de ${normalizedData.length} filas`;
    } else if (updated > 0) {
      message = `Se actualizaron ${updated} lotes de ${normalizedData.length} filas`;
    } else {
      message = `No se pudo importar ningún lote de ${normalizedData.length} filas`;
    }

    // Combine errors and warnings for detailed reporting
    const allIssues = [...errors, ...warnings];

    return {
      success: imported > 0 || updated > 0,
      message,
      imported: imported + updated,
      errors: allIssues.length > 0 ? allIssues : undefined,
    };
  } catch (_error) {
    return {
      success: false,
      message: "Error inesperado al importar stock",
    };
  }
}

/**
 * Server action to import customers from Excel file
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Import function requires multiple validations and database operations
export async function importCustomers(
  formData: FormData,
  orgSlug: string
): Promise<ImportResult> {
  try {
    const file = formData.get("file") as File;

    if (!file) {
      return {
        success: false,
        message: "No se recibió ningún archivo",
      };
    }

    const parseResult = await parseExcelFile(file);

    if (!(parseResult.success && parseResult.data)) {
      return {
        success: false,
        message: parseResult.error || "Error al procesar el archivo",
      };
    }

    const normalizedData = normalizeData(parseResult.data);

    // Get organization
    const org = await getOrganizationBySlug(orgSlug);
    if (!org?.id) {
      return {
        success: false,
        message: "Organización no encontrada",
      };
    }

    // Get supabase client
    const supabase = await createClient();

    // Get existing customers to check for duplicate CUITs
    const { data: existingCustomers } = await supabase
      .from("customers")
      .select("cuit, business_name")
      .eq("organization_id", org.id);

    // Create a Set of existing CUITs for quick lookup (only non-null CUITs)
    const existingCuits = new Set(
      existingCustomers
        ?.filter((c) => c.cuit)
        .map((c) => c.cuit?.trim().toLowerCase()) || []
    );

    const errors: string[] = [];
    const skipped: string[] = [];
    let imported = 0;

    for (const [index, row] of normalizedData.entries()) {
      try {
        // Validate required field
        if (!row.business_name) {
          errors.push(
            `Fila ${index + 3}: Falta razón social (campo obligatorio)`
          );
          continue;
        }

        // Check for duplicate CUIT if provided
        if (row.cuit) {
          const cuitLower = String(row.cuit).trim().toLowerCase();
          if (existingCuits.has(cuitLower)) {
            skipped.push(
              `Fila ${index + 3}: Cliente con CUIT "${row.cuit}" ya existe en la base de datos`
            );
            continue;
          }
          existingCuits.add(cuitLower);
        }

        // Insert customer
        const { error: insertError } = await supabase.from("customers").insert({
          organization_id: org.id,
          business_name: String(row.business_name).trim(),
          fantasy_name: row.fantasy_name
            ? String(row.fantasy_name).trim()
            : null,
          cuit: row.cuit ? String(row.cuit).trim() : null,
          email: row.email ? String(row.email).trim() : null,
          phone: row.phone ? String(row.phone).trim() : null,
          address: row.address ? String(row.address).trim() : null,
          city: row.city ? String(row.city).trim() : null,
          tax_condition: row.tax_condition
            ? String(row.tax_condition).trim()
            : null,
        });

        if (insertError) {
          console.error("Error inserting customer:", insertError);
          errors.push(`Fila ${index + 3}: Error al crear el cliente`);
          continue;
        }

        imported += 1;
      } catch (error) {
        console.error(`Error importing row ${index + 3}:`, error);
        const errorMessage =
          error instanceof Error ? error.message : "Error desconocido";
        errors.push(`Fila ${index + 3}: ${errorMessage}`);
      }
    }

    revalidatePath(`/org/${orgSlug}/customers`);

    // Build result message
    let message = `Se importaron ${imported} de ${normalizedData.length} clientes`;
    if (skipped.length > 0) {
      message += `. ${skipped.length} clientes se saltaron por CUIT duplicado`;
    }

    const allIssues = [...errors, ...skipped];

    return {
      success: true,
      message,
      imported,
      errors: allIssues.length > 0 ? allIssues : undefined,
    };
  } catch (error) {
    console.error("Error in importCustomers:", error);
    return {
      success: false,
      message: "Error inesperado al importar clientes",
    };
  }
}

/**
 * Server action to import suppliers from Excel file
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Import function requires multiple validations and database operations
export async function importSuppliers(
  formData: FormData,
  orgSlug: string
): Promise<ImportResult> {
  try {
    const file = formData.get("file") as File;

    if (!file) {
      return {
        success: false,
        message: "No se recibió ningún archivo",
      };
    }

    const parseResult = await parseExcelFile(file);

    if (!(parseResult.success && parseResult.data)) {
      return {
        success: false,
        message: parseResult.error || "Error al procesar el archivo",
      };
    }

    const normalizedData = normalizeData(parseResult.data);

    // Get organization
    const org = await getOrganizationBySlug(orgSlug);
    if (!org?.id) {
      return {
        success: false,
        message: "Organización no encontrada",
      };
    }

    // Get supabase client
    const supabase = await createClient();

    // Get existing suppliers to check for duplicate names and CUITs
    const { data: existingSuppliers } = await supabase
      .from("suppliers")
      .select("name, cuit")
      .eq("organization_id", org.id);

    // Create Sets for quick lookup
    const existingNames = new Set(
      existingSuppliers?.map((s) => s.name.trim().toLowerCase()) || []
    );
    const existingCuits = new Set(
      existingSuppliers
        ?.filter((s) => s.cuit)
        .map((s) => s.cuit?.trim().toLowerCase()) || []
    );

    const errors: string[] = [];
    const skipped: string[] = [];
    let imported = 0;

    for (const [index, row] of normalizedData.entries()) {
      try {
        // Validate required field
        if (!row.name) {
          errors.push(`Fila ${index + 3}: Falta nombre (campo obligatorio)`);
          continue;
        }

        // Check for duplicate name
        const nameLower = String(row.name).trim().toLowerCase();
        if (existingNames.has(nameLower)) {
          skipped.push(
            `Fila ${index + 3}: Proveedor con nombre "${row.name}" ya existe en la base de datos`
          );
          continue;
        }

        // Check for duplicate CUIT if provided
        if (row.cuit) {
          const cuitLower = String(row.cuit).trim().toLowerCase();
          if (existingCuits.has(cuitLower)) {
            skipped.push(
              `Fila ${index + 3}: Proveedor con CUIT "${row.cuit}" ya existe en la base de datos`
            );
            continue;
          }
          existingCuits.add(cuitLower);
        }

        // Insert supplier
        const { error: insertError } = await supabase.from("suppliers").insert({
          organization_id: org.id,
          name: String(row.name).trim(),
          cuit: row.cuit ? String(row.cuit).trim() : null,
          email: row.email ? String(row.email).trim() : null,
          phone: row.phone ? String(row.phone).trim() : null,
          address: row.address ? String(row.address).trim() : null,
          contact_name: row.contact_name
            ? String(row.contact_name).trim()
            : null,
          payment_terms: row.payment_terms
            ? String(row.payment_terms).trim()
            : null,
          notes: row.notes ? String(row.notes).trim() : null,
        });

        if (insertError) {
          console.error("Error inserting supplier:", insertError);
          errors.push(`Fila ${index + 3}: Error al crear el proveedor`);
          continue;
        }

        // Mark name as used
        existingNames.add(nameLower);
        imported += 1;
      } catch (error) {
        console.error(`Error importing row ${index + 3}:`, error);
        const errorMessage =
          error instanceof Error ? error.message : "Error desconocido";
        errors.push(`Fila ${index + 3}: ${errorMessage}`);
      }
    }

    revalidatePath(`/org/${orgSlug}/suppliers`);

    // Build result message
    let message = `Se importaron ${imported} de ${normalizedData.length} proveedores`;
    if (skipped.length > 0) {
      message += `. ${skipped.length} proveedores se saltaron por nombre o CUIT duplicado`;
    }

    const allIssues = [...errors, ...skipped];

    return {
      success: true,
      message,
      imported,
      errors: allIssues.length > 0 ? allIssues : undefined,
    };
  } catch (error) {
    console.error("Error in importSuppliers:", error);
    return {
      success: false,
      message: "Error inesperado al importar proveedores",
    };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { read, utils } from "xlsx";
import { truncateMoney } from "@/lib/decimal";
import { createClient } from "@/lib/supabase/server";
import {
  getOrganizationBySlug,
  upsertDirectSalePrices,
} from "@/modules/organizations/service/organizations.service";
import type { UpsertDirectSalePriceInput } from "@/modules/organizations/types";

const PRODUCT_ID_HEADER = "ID";
const LEGACY_PRODUCT_ID_HEADER = "ID Producto";
const MANUAL_PRICE_HEADER = "Precio Directo";
const LEGACY_MANUAL_PRICE_HEADER = "Precio Venta Directa (Manual)";

export type ImportDirectSalePricesActionResult = {
  success: boolean;
  error?: string;
  processed: number;
  skipped: number;
  errors: string[];
};

type ParsedRow = Record<string, unknown>;

type ParsedDirectSalePrices = {
  prices: UpsertDirectSalePriceInput[];
  skipped: number;
  errors: string[];
};

function getProductIdsFromRows(rows: ParsedRow[]): string[] {
  return [...new Set(rows.map((row) => getProductId(row)).filter(Boolean))];
}

function getProductId(row: ParsedRow): string {
  return String(
    row[PRODUCT_ID_HEADER] ?? row[LEGACY_PRODUCT_ID_HEADER] ?? ""
  ).trim();
}

function getManualPrice(row: ParsedRow): unknown {
  return row[MANUAL_PRICE_HEADER] ?? row[LEGACY_MANUAL_PRICE_HEADER];
}

async function parseDirectSalePricesExcelFile(
  file: File
): Promise<
  { success: true; data: ParsedRow[] } | { success: false; error: string }
> {
  try {
    const workbook = read(await file.arrayBuffer(), { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = sheetName ? workbook.Sheets[sheetName] : null;

    if (!worksheet) {
      return { success: false, error: "No se encontró una hoja en el archivo" };
    }

    const rows = utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: "",
    });

    if (rows.length < 3) {
      return {
        success: false,
        error: "El archivo no tiene filas para importar.",
      };
    }

    const headers = (rows[0] ?? []).map((header) => String(header).trim());
    const hasRequiredHeaders =
      (headers.includes(PRODUCT_ID_HEADER) ||
        headers.includes(LEGACY_PRODUCT_ID_HEADER)) &&
      (headers.includes(MANUAL_PRICE_HEADER) ||
        headers.includes(LEGACY_MANUAL_PRICE_HEADER));

    if (!hasRequiredHeaders) {
      return {
        success: false,
        error: "La plantilla debe incluir las columnas ID y Precio Directo.",
      };
    }

    const data = rows
      .slice(2)
      .filter((row) => row.some((cell) => cell !== "" && cell !== null))
      .map((row) =>
        headers.reduce<ParsedRow>((acc, header, index) => {
          if (header) {
            acc[header] = row[index] ?? "";
          }
          return acc;
        }, {})
      );

    return { success: true, data };
  } catch (_error) {
    return {
      success: false,
      error: "Error al leer el archivo. Asegúrate de que sea un Excel válido.",
    };
  }
}

function parseManualPrice(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? truncateMoney(value) : null;
  }

  const rawValue = String(value).trim();

  if (!rawValue) {
    return null;
  }

  const normalizedCurrency = rawValue.replace(/\s/g, "").replace(/\$/g, "");
  const commaIndex = normalizedCurrency.lastIndexOf(",");
  const dotIndex = normalizedCurrency.lastIndexOf(".");
  const normalizedNumber =
    commaIndex > dotIndex
      ? normalizedCurrency.replace(/\./g, "").replace(",", ".")
      : normalizedCurrency.replace(/,/g, "");
  const parsed = Number(normalizedNumber);

  return Number.isFinite(parsed) && parsed >= 0 ? truncateMoney(parsed) : null;
}

async function getExistingProductIds(
  orgId: string,
  productIds: string[]
): Promise<Set<string>> {
  if (productIds.length === 0) {
    return new Set();
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("id")
    .eq("organization_id", orgId)
    .in("id", productIds);

  if (error) {
    throw new Error(`Error al validar productos: ${error.message}`);
  }

  return new Set((data ?? []).map((product) => product.id));
}

function parseDirectSalePriceRows(
  rows: ParsedRow[],
  existingProductIds: Set<string>
): ParsedDirectSalePrices {
  const seenProductIds = new Set<string>();
  const errors: string[] = [];
  const prices: UpsertDirectSalePriceInput[] = [];
  let skipped = 0;

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 3;
    const productId = getProductId(row);
    const rawPrice = getManualPrice(row);

    if (!productId) {
      errors.push(`Fila ${rowNumber}: falta el ID del producto.`);
      continue;
    }

    if (!existingProductIds.has(productId)) {
      errors.push(
        `Fila ${rowNumber}: el producto no existe en la organización.`
      );
      continue;
    }

    if (
      rawPrice === null ||
      rawPrice === undefined ||
      String(rawPrice).trim() === ""
    ) {
      skipped += 1;
      continue;
    }

    if (seenProductIds.has(productId)) {
      errors.push(
        `Fila ${rowNumber}: el producto está repetido en el archivo.`
      );
      continue;
    }

    const price = parseManualPrice(rawPrice);

    if (price === null) {
      errors.push(
        `Fila ${rowNumber}: el precio manual debe ser numérico y no negativo.`
      );
      continue;
    }

    seenProductIds.add(productId);
    prices.push({ productId, price });
  }

  return { prices, skipped, errors };
}

export async function importDirectSalePricesAction(
  orgSlug: string,
  formData: FormData
): Promise<ImportDirectSalePricesActionResult> {
  try {
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return {
        success: false,
        error: "No se recibió ningún archivo",
        processed: 0,
        skipped: 0,
        errors: [],
      };
    }

    const parseResult = await parseDirectSalePricesExcelFile(file);

    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error,
        processed: 0,
        skipped: 0,
        errors: [],
      };
    }

    const org = await getOrganizationBySlug(orgSlug);

    if (!org?.id) {
      return {
        success: false,
        error: "Organización no encontrada",
        processed: 0,
        skipped: 0,
        errors: [],
      };
    }

    const productIdsInFile = getProductIdsFromRows(parseResult.data);
    const existingProductIds = await getExistingProductIds(
      org.id,
      productIdsInFile
    );
    const { prices, skipped, errors } = parseDirectSalePriceRows(
      parseResult.data,
      existingProductIds
    );

    if (prices.length === 0) {
      return {
        success: errors.length === 0,
        error:
          errors.length > 0
            ? "No se pudo importar ningún precio."
            : "No se encontraron precios manuales para actualizar.",
        processed: 0,
        skipped,
        errors,
      };
    }

    const updated = await upsertDirectSalePrices(orgSlug, prices);

    revalidatePath(`/org/${orgSlug}/configuracion/venta-directa`);
    revalidatePath(`/org/${orgSlug}/venta-directa/nueva`);

    return {
      success: errors.length === 0,
      error:
        errors.length > 0
          ? `${errors.length} filas no se importaron.`
          : undefined,
      processed: updated,
      skipped,
      errors,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error inesperado al importar precios de venta directa",
      processed: 0,
      skipped: 0,
      errors: [],
    };
  }
}

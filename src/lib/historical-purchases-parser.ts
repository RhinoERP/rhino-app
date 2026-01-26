import type { HistoricalPurchaseRowData } from "@/modules/purchases/historical/types";
import { parseExcelFile } from "./excel-parser";

// Expected headers mapping (Spanish to internal keys)
const HEADER_MAPPING: Record<string, keyof HistoricalPurchaseRowData> = {
  mes: "mes",
  año: "año",
  "monto compras": "monto_total",
  "cantidad órdenes": "cantidad_ordenes",
  "cantidad ordenes": "cantidad_ordenes", // Alternative without accent
  notas: "notas",
};

/**
 * Parse a single field value based on the field type
 */
function parseFieldValue(
  mappedKey: keyof HistoricalPurchaseRowData,
  value: unknown,
  rowIndex: number,
  originalKey: string
): number | string | undefined {
  if (mappedKey === "mes" || mappedKey === "año") {
    // Parse as integer
    const numValue = Number.parseInt(String(value), 10);
    if (Number.isNaN(numValue)) {
      throw new Error(
        `Fila ${rowIndex + 2}: ${originalKey} debe ser un número entero`
      );
    }
    return numValue;
  }

  if (mappedKey === "monto_total" || mappedKey === "cantidad_ordenes") {
    // Parse as number
    const numValue = Number.parseFloat(String(value));
    if (Number.isNaN(numValue)) {
      throw new Error(
        `Fila ${rowIndex + 2}: ${originalKey} debe ser un número`
      );
    }
    return numValue;
  }

  if (mappedKey === "notas") {
    // Optional string
    return value ? String(value) : undefined;
  }

  return;
}

/**
 * Normalize a single row from Excel to HistoricalPurchaseRowData
 */
function normalizeRow(
  row: Record<string, unknown>,
  index: number
): HistoricalPurchaseRowData {
  const normalizedRow: Partial<HistoricalPurchaseRowData> = {};

  // Normalize headers to snake_case
  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = key.toLowerCase().trim();
    const mappedKey = HEADER_MAPPING[normalizedKey];

    if (mappedKey) {
      const parsedValue = parseFieldValue(mappedKey, value, index, key);
      if (parsedValue !== undefined) {
        normalizedRow[mappedKey] = parsedValue as never;
      }
    }
  }

  // Validate required fields
  if (
    typeof normalizedRow.mes !== "number" ||
    typeof normalizedRow.año !== "number" ||
    typeof normalizedRow.monto_total !== "number" ||
    typeof normalizedRow.cantidad_ordenes !== "number"
  ) {
    throw new Error(
      `Fila ${index + 2}: Faltan campos obligatorios (Mes, Año, Monto Compras, Cantidad Órdenes)`
    );
  }

  return normalizedRow as HistoricalPurchaseRowData;
}

/**
 * Parse historical purchases Excel file
 */
export async function parseHistoricalPurchasesExcel(file: File): Promise<{
  success: boolean;
  data?: HistoricalPurchaseRowData[];
  error?: string;
}> {
  try {
    const parseResult = await parseExcelFile(file);

    if (!(parseResult.success && parseResult.data)) {
      return {
        success: false,
        error: parseResult.error || "Error al procesar el archivo",
      };
    }

    const rawData = parseResult.data;
    const processedData: HistoricalPurchaseRowData[] = [];

    for (const [index, row] of rawData.entries()) {
      try {
        const normalizedRow = normalizeRow(row, index);
        processedData.push(normalizedRow);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Error desconocido";
        return {
          success: false,
          error: message,
        };
      }
    }

    if (processedData.length === 0) {
      return {
        success: false,
        error: "No se encontraron datos válidos en el archivo",
      };
    }

    return {
      success: true,
      data: processedData,
    };
  } catch (error) {
    // Error parsing historical purchases Excel
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error al procesar el archivo Excel",
    };
  }
}

import type { HistoricalSalesRowData } from "@/modules/sales/historical/types";
import { parseExcelFile } from "./excel-parser";

// Expected headers mapping (Spanish to internal keys)
const HEADER_MAPPING: Record<string, keyof HistoricalSalesRowData> = {
  mes: "mes",
  año: "año",
  "monto total": "monto_total",
  "cantidad de pedidos": "cantidad_pedidos",
  notas: "notas",
};

/**
 * Parse a single field value based on the field type
 */
function parseFieldValue(
  mappedKey: keyof HistoricalSalesRowData,
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

  if (mappedKey === "monto_total" || mappedKey === "cantidad_pedidos") {
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
 * Normalize a single row from Excel to HistoricalSalesRowData
 */
function normalizeRow(
  row: Record<string, unknown>,
  index: number
): HistoricalSalesRowData {
  const normalizedRow: Partial<HistoricalSalesRowData> = {};

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
    typeof normalizedRow.cantidad_pedidos !== "number"
  ) {
    throw new Error(
      `Fila ${index + 2}: Faltan campos obligatorios (Mes, Año, Monto Total, Cantidad de Pedidos)`
    );
  }

  return normalizedRow as HistoricalSalesRowData;
}

/**
 * Parse historical sales Excel file
 */
export async function parseHistoricalSalesExcel(file: File): Promise<{
  success: boolean;
  data?: HistoricalSalesRowData[];
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
    const processedData: HistoricalSalesRowData[] = [];

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
    // Error parsing historical sales Excel
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error al procesar el archivo Excel",
    };
  }
}

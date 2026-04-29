import { read, utils } from "xlsx";

export type ParsedRow = Record<string, unknown>;

export type ParseResult = {
  success: boolean;
  data?: ParsedRow[];
  error?: string;
  rowCount?: number;
};

/**
 * Parses an Excel file and extracts data rows
 * Expects row 1 to be headers and row 2 to be descriptions
 * Data starts from row 3
 */
export async function parseExcelFile(file: File): Promise<ParseResult> {
  try {
    // Read file as array buffer
    const arrayBuffer = await file.arrayBuffer();

    // Parse workbook
    const workbook = read(arrayBuffer, { type: "array" });

    // Get first sheet (Datos)
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      return {
        success: false,
        error: "No se encontró la hoja de datos en el archivo",
      };
    }

    // Convert sheet to JSON, using row 1 as headers
    const jsonData = utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: "",
    });

    if (jsonData.length < 3) {
      return {
        success: false,
        error:
          "El archivo no tiene suficientes filas. Asegúrate de usar la plantilla correcta.",
      };
    }

    // Extract headers from row 1 (index 0)
    const headers = jsonData[0] as string[];

    // Skip row 1 (headers) and row 2 (descriptions), get data from row 3 onwards
    const dataRows = jsonData.slice(2);

    // Convert array rows to objects using headers
    const parsedData: ParsedRow[] = dataRows
      .filter((row) => {
        // Filter out empty rows
        return row.some((cell) => cell !== "" && cell !== null);
      })
      .map((row) => {
        const rowObject: ParsedRow = {};

        for (const [index, header] of headers.entries()) {
          if (header) {
            rowObject[header] = row[index] ?? "";
          }
        }

        return rowObject;
      });

    return {
      success: true,
      data: parsedData,
      rowCount: parsedData.length,
    };
  } catch (_error) {
    // Error parsing Excel file
    return {
      success: false,
      error:
        "Error al leer el archivo. Asegúrate de que sea un archivo Excel válido.",
    };
  }
}

/**
 * Normalizes field names from Spanish to database column names
 */
export function normalizeFieldName(spanishName: string): string {
  const fieldMap: Record<string, string> = {
    // Products
    Nombre: "name",
    "Código SKU": "sku",
    Descripción: "description",
    Marca: "brand",
    Categoría: "category",
    Proveedor: "supplier",
    "Margen de ganancia": "profit_margin",
    "Stock mínimo": "min_stock",
    "Unidad de medida": "unit",
    "Unidades por caja": "units_per_box",
    "Cajas por palet": "boxes_per_pallet",
    "Peso por unidad": "weight_per_unit",

    // Stock
    SKU: "sku",
    Cantidad: "quantity",
    "Cantidad (kg/lt)": "quantity",
    "Cantidad (kg/LT)": "quantity",
    "Cantidad (kg/lt/m)": "quantity",
    "Cantidad (peso/volumen)": "quantity",
    Unidades: "unit_quantity",
    "Cantidad (unidades)": "unit_quantity",
    "Número de lote": "lot_number",
    "Fecha de vencimiento": "expiration_date",
    "Cantidad de Cajas": "box_quantity",
    "Unidades Sueltas": "loose_units",
    Lote: "lot_number", // Alias alternativo

    // Customers
    "Dirección de entrega": "delivery_address",
    "Ciudad de entrega": "delivery_city",
    "Transportista preferido": "preferred_carrier",
    Vendedor: "seller",
    "Razón social": "business_name",
    "Nombre fantasía": "fantasy_name",
    "Número de cliente": "client_number",
    "Numero de cliente": "client_number",
    "Número de Cliente": "client_number",
    "Numero de Cliente": "client_number",
    "N° de cliente": "client_number",
    "Nro de cliente": "client_number",
    CUIT: "cuit",
    Email: "email",
    Teléfono: "phone",
    Dirección: "address",
    Ciudad: "city",
    "Condición fiscal": "tax_condition",

    // Suppliers
    "Persona de contacto": "contact_name",
    "Condiciones de pago": "payment_terms",
    Notas: "notes",
  };

  return fieldMap[spanishName] || spanishName.toLowerCase().replace(/ /g, "_");
}

/**
 * Converts parsed data with Spanish headers to database-ready format
 */
export function normalizeData(data: ParsedRow[]): ParsedRow[] {
  return data.map((row) => {
    const normalizedRow: ParsedRow = {};

    for (const [key, value] of Object.entries(row)) {
      const normalizedKey = normalizeFieldName(key);
      normalizedRow[normalizedKey] = value;
    }

    return normalizedRow;
  });
}

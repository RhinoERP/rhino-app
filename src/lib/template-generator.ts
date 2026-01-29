import type { WorkSheet } from "xlsx";
import { utils, write } from "xlsx";

export type ProductTemplateRow = {
  nombre: string;
  sku: string;
  descripcion: string;
  marca: string;
  categoria: string;
  proveedor: string;
  margen_ganancia: string;
  stock_minimo: string;
  unidad_medida: string;
  unidades_por_caja: string;
  cajas_por_palet: string;
  peso_por_unidad: string;
};

export type StockTemplateRow = {
  sku: string;
  proveedor: string;
  cantidad: string;
  numero_lote: string;
  fecha_vencimiento: string;
};

export type CustomerTemplateRow = {
  razon_social: string;
  cuit: string;
  email: string;
  telefono: string;
  direccion: string;
  ciudad: string;
  condicion_fiscal: string;
};

export type SupplierTemplateRow = {
  nombre: string;
  cuit: string;
  email: string;
  telefono: string;
  direccion: string;
  persona_contacto: string;
};

export type HistoricalSalesTemplateRow = {
  mes: string;
  año: string;
  monto_total: string;
  cantidad_pedidos: string;
  notas: string;
};

export type HistoricalPurchasesTemplateRow = {
  mes: string;
  año: string;
  monto_compras: string;
  cantidad_ordenes: string;
  notas: string;
};

type TemplateType =
  | "products"
  | "stock"
  | "customers"
  | "suppliers"
  | "historical_sales"
  | "historical_purchases";

type TemplateColumn = {
  header: string;
  description: string;
  required: boolean;
};

const TEMPLATE_COLUMNS: Record<TemplateType, TemplateColumn[]> = {
  products: [
    {
      header: "Nombre",
      description: "Nombre del producto (obligatorio).",
      required: true,
    },
    {
      header: "Código SKU",
      description: "Código SKU único del producto (obligatorio).",
      required: true,
    },
    {
      header: "Descripción",
      description: "Descripción del producto (opcional).",
      required: false,
    },
    {
      header: "Marca",
      description: "Marca del producto (opcional).",
      required: false,
    },
    {
      header: "Categoría",
      description: "Categoría principal (opcional).",
      required: false,
    },
    {
      header: "Proveedor",
      description: "Nombre del proveedor (opcional).",
      required: false,
    },
    {
      header: "Margen de ganancia",
      description:
        "Margen de ganancia en porcentaje (opcional, ej: 35 para 35%).",
      required: false,
    },
    {
      header: "Stock mínimo",
      description: "Stock mínimo (opcional).",
      required: false,
    },
    {
      header: "Unidad de medida",
      description: "Unidad de medida (opcional).",
      required: false,
    },
    {
      header: "Unidades por caja",
      description: "Unidades por caja (opcional).",
      required: false,
    },
    {
      header: "Cajas por palet",
      description: "Cajas por palet (opcional).",
      required: false,
    },
    {
      header: "Peso por unidad",
      description: "Peso por unidad en kg (opcional, ej: 2.25).",
      required: false,
    },
  ],
  stock: [
    {
      header: "SKU",
      description: "Código SKU del producto (obligatorio).",
      required: true,
    },
    {
      header: "Proveedor",
      description:
        "Nombre del proveedor del producto (obligatorio si hay productos con mismo SKU de diferentes proveedores).",
      required: false,
    },
    {
      header: "Cantidad",
      description: "Cantidad disponible (obligatorio).",
      required: true,
    },
    {
      header: "Número de lote",
      description: "Número de lote (opcional).",
      required: false,
    },
    {
      header: "Fecha de vencimiento",
      description: "Fecha de vencimiento en formato AAAA-MM-DD (opcional).",
      required: false,
    },
  ],
  customers: [
    {
      header: "Razón social",
      description: "Razón social del cliente (obligatorio).",
      required: true,
    },
    {
      header: "Nombre fantasía",
      description: "Nombre fantasía o comercial del cliente (opcional).",
      required: false,
    },
    {
      header: "CUIT",
      description: "CUIT del cliente (opcional).",
      required: false,
    },
    {
      header: "Email",
      description: "Email de contacto (opcional).",
      required: false,
    },
    {
      header: "Teléfono",
      description: "Teléfono de contacto (opcional).",
      required: false,
    },
    {
      header: "Dirección",
      description: "Dirección física (opcional).",
      required: false,
    },
    {
      header: "Ciudad",
      description: "Ciudad (opcional).",
      required: false,
    },
    {
      header: "Condición fiscal",
      description: "Condición fiscal (opcional).",
      required: false,
    },
  ],
  suppliers: [
    {
      header: "Nombre",
      description: "Nombre del proveedor (obligatorio).",
      required: true,
    },
    {
      header: "CUIT",
      description: "CUIT del proveedor (opcional).",
      required: false,
    },
    {
      header: "Email",
      description: "Email de contacto (opcional).",
      required: false,
    },
    {
      header: "Teléfono",
      description: "Teléfono de contacto (opcional).",
      required: false,
    },
    {
      header: "Dirección",
      description: "Dirección física (opcional).",
      required: false,
    },
    {
      header: "Persona de contacto",
      description: "Nombre de la persona de contacto (opcional).",
      required: false,
    },
    {
      header: "Condiciones de pago",
      description:
        "Condiciones de pago (ej: 30 días, contado, etc.) (opcional).",
      required: false,
    },
    {
      header: "Notas",
      description: "Notas adicionales sobre el proveedor (opcional).",
      required: false,
    },
  ],
  historical_sales: [
    {
      header: "Mes",
      description: "Número del mes (1-12, obligatorio).",
      required: true,
    },
    {
      header: "Año",
      description: "Año de la venta (ej: 2024, obligatorio).",
      required: true,
    },
    {
      header: "Monto Total",
      description: "Monto total facturado en el mes (obligatorio).",
      required: true,
    },
    {
      header: "Cantidad de Pedidos",
      description: "Cantidad de pedidos realizados en el mes (obligatorio).",
      required: true,
    },
    {
      header: "Notas",
      description: "Notas adicionales sobre el período (opcional).",
      required: false,
    },
  ],
  historical_purchases: [
    {
      header: "Mes",
      description: "Número del mes (1-12, obligatorio).",
      required: true,
    },
    {
      header: "Año",
      description: "Año de la compra (ej: 2024, obligatorio).",
      required: true,
    },
    {
      header: "Monto Compras",
      description: "Monto total de compras en el mes (obligatorio).",
      required: true,
    },
    {
      header: "Cantidad Órdenes",
      description: "Cantidad de órdenes de compra en el mes (obligatorio).",
      required: true,
    },
    {
      header: "Notas",
      description: "Notas adicionales sobre el período (opcional).",
      required: false,
    },
  ],
};

const TEMPLATE_FILENAMES: Record<TemplateType, string> = {
  products: "plantilla_productos.xlsx",
  stock: "plantilla_stock.xlsx",
  customers: "plantilla_clientes.xlsx",
  suppliers: "plantilla_proveedores.xlsx",
  historical_sales: "plantilla_ventas_historicas.xlsx",
  historical_purchases: "plantilla_compras_historicas.xlsx",
};

type TemplateOptions = {
  categories?: string[];
};

/**
 * Generates and downloads an Excel template for data import with Spanish headers and descriptions
 */
export function downloadTemplate(
  type: TemplateType,
  options?: TemplateOptions
): void {
  try {
    const columns = TEMPLATE_COLUMNS[type];

    // Create header row with column names
    const headers = columns.map((col) => col.header);

    // Create description row with explanations
    const descriptions = columns.map((col) => col.description);

    // Build worksheet data: [headers, descriptions]
    const worksheetData = [headers, descriptions];

    // Create worksheet
    const worksheet: WorkSheet = utils.aoa_to_sheet(worksheetData);

    // Style the header row (row 1) - make it bold and with background
    // Note: Basic XLSX doesn't support full styling, but we can set column widths
    const columnWidths = columns.map((col) => ({
      wch: Math.max(col.header.length, 25), // Minimum 25 chars for readability
    }));
    worksheet["!cols"] = columnWidths;

    // Freeze the first 2 rows (header + description)
    worksheet["!freeze"] = { xSplit: 0, ySplit: 2 };

    // Create workbook and add the worksheet
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, worksheet, "Datos");

    const instructionsRows: string[][] = [
      ["Instrucciones para importar datos"],
      [""],
      ["1. No cambiar el nombre ni el orden de las columnas."],
      ["2. Las columnas marcadas como obligatorias deben completarse."],
      ["3. Empezá a cargar datos en la fila 3."],
      ["4. Guardá el archivo y subilo desde la plataforma."],
      [""],
      ["Columnas del template:"],
      ...columns.map((col) => [
        col.header,
        col.required ? "Obligatorio" : "Opcional",
        col.description,
      ]),
    ];

    if (type === "products") {
      const categories = (options?.categories ?? [])
        .map((category) => category.trim())
        .filter((category) => category.length > 0);
      const uniqueCategories = Array.from(new Set(categories));

      instructionsRows.push([""]);
      instructionsRows.push([
        "Categorías existentes (usar el nombre exacto en la columna Categoría):",
      ]);

      if (uniqueCategories.length === 0) {
        instructionsRows.push(["No hay categorías registradas."]);
      } else {
        for (const category of uniqueCategories) {
          instructionsRows.push([category]);
        }
      }
    }

    // Add metadata/instructions sheet
    const instructionsSheet = utils.aoa_to_sheet(instructionsRows);
    utils.book_append_sheet(workbook, instructionsSheet, "Instrucciones");

    // Generate Excel file
    const excelBuffer = write(workbook, { bookType: "xlsx", type: "array" });

    // Create blob and download
    const blob = new Blob([excelBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    // Create download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = TEMPLATE_FILENAMES[type];
    document.body.appendChild(link);
    link.click();

    // Cleanup
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (_error) {
    // Error generating template
    throw new Error("No se pudo generar la plantilla");
  }
}

/**
 * Factura de proveedor leída de un PDF · forma de los datos.
 *
 * El JSON Schema obliga a la IA a devolver exactamente esto; el tipo es el
 * mismo dato del lado de TypeScript.
 */

export const INVOICE_LINE_UNITS = [
  "UN",
  "KG",
  "LT",
  "MT",
  "CAJA",
  "OTRO",
] as const;
export type InvoiceLineUnit = (typeof INVOICE_LINE_UNITS)[number];

export type ExtractedInvoiceLine = {
  codigo: string | null;
  descripcion: string;
  cantidad: number;
  unidad: InvoiceLineUnit;
  precio_unitario: number;
  descuento_porcentaje: number;
  subtotal: number;
  alicuota_iva: number | null;
};

export type ExtractedInvoiceTax = {
  nombre: string;
  alicuota: number | null;
  importe: number;
};

export type ExtractedInvoice = {
  es_factura: boolean;
  proveedor: { nombre: string; cuit: string | null };
  tipo_comprobante: "A" | "B" | "C" | "M" | "E" | "Otro";
  punto_de_venta: string | null;
  numero: string;
  fecha: string;
  vencimiento: string | null;
  moneda: "ARS" | "USD";
  cotizacion: number | null;
  precios_incluyen_iva: boolean;
  lineas: ExtractedInvoiceLine[];
  descuento_global_porcentaje: number;
  subtotal_neto: number;
  impuestos: ExtractedInvoiceTax[];
  total: number;
  observaciones: string | null;
};

const nullableString = { type: ["string", "null"] };
const nullableNumber = { type: ["number", "null"] };

export const EXTRACTED_INVOICE_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "es_factura",
    "proveedor",
    "tipo_comprobante",
    "punto_de_venta",
    "numero",
    "fecha",
    "vencimiento",
    "moneda",
    "cotizacion",
    "precios_incluyen_iva",
    "lineas",
    "descuento_global_porcentaje",
    "subtotal_neto",
    "impuestos",
    "total",
    "observaciones",
  ],
  properties: {
    es_factura: {
      type: "boolean",
      description:
        "false si el PDF no es una factura, nota o remito valorizado de compra.",
    },
    proveedor: {
      type: "object",
      additionalProperties: false,
      required: ["nombre", "cuit"],
      properties: {
        nombre: {
          type: "string",
          description: "Razón social del EMISOR de la factura (el que vende).",
        },
        cuit: {
          ...nullableString,
          description: "CUIT del emisor, solo dígitos.",
        },
      },
    },
    tipo_comprobante: {
      type: "string",
      enum: ["A", "B", "C", "M", "E", "Otro"],
    },
    punto_de_venta: {
      ...nullableString,
      description: "Punto de venta tal cual, ej. 0003.",
    },
    numero: {
      type: "string",
      description: "Número de comprobante sin el punto de venta, ej. 00012345.",
    },
    fecha: { type: "string", description: "Fecha de emisión, YYYY-MM-DD." },
    vencimiento: {
      ...nullableString,
      description: "Vencimiento del pago, YYYY-MM-DD, si figura.",
    },
    moneda: { type: "string", enum: ["ARS", "USD"] },
    cotizacion: {
      ...nullableNumber,
      description: "Tipo de cambio si la factura es en dólares.",
    },
    precios_incluyen_iva: {
      type: "boolean",
      description:
        "true si los precios de las líneas ya incluyen IVA (facturas B o C).",
    },
    lineas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "codigo",
          "descripcion",
          "cantidad",
          "unidad",
          "precio_unitario",
          "descuento_porcentaje",
          "subtotal",
          "alicuota_iva",
        ],
        properties: {
          codigo: { ...nullableString, description: "Código del artículo." },
          descripcion: { type: "string" },
          cantidad: { type: "number" },
          unidad: { type: "string", enum: [...INVOICE_LINE_UNITS] },
          precio_unitario: {
            type: "number",
            description: "Precio por unidad de la línea, tal cual figura.",
          },
          descuento_porcentaje: {
            type: "number",
            description: "Bonificación de la línea en %, 0 si no hay.",
          },
          subtotal: {
            type: "number",
            description: "Importe de la línea tal cual figura.",
          },
          alicuota_iva: {
            ...nullableNumber,
            description: "IVA de la línea en %.",
          },
        },
      },
    },
    descuento_global_porcentaje: {
      type: "number",
      description: "Bonificación general sobre el total en %, 0 si no hay.",
    },
    subtotal_neto: {
      type: "number",
      description: "Importe neto gravado + no gravado, antes de impuestos.",
    },
    impuestos: {
      type: "array",
      description: "IVA por alícuota, percepciones e impuestos internos.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nombre", "alicuota", "importe"],
        properties: {
          nombre: {
            type: "string",
            description: "Ej. IVA 21%, Percepción IIBB.",
          },
          alicuota: nullableNumber,
          importe: { type: "number" },
        },
      },
    },
    total: { type: "number" },
    observaciones: {
      ...nullableString,
      description:
        "Algo que el comprador deba saber (texto ilegible, páginas faltantes).",
    },
  },
};

export const EXTRACTION_PROMPT = `Sos un asistente que lee facturas de proveedores argentinos (distribuidoras de alimentos) y pasa sus datos a un sistema de compras.

Reglas:
- El proveedor es el EMISOR de la factura (arriba, junto al tipo de comprobante). No confundas con el cliente/comprador.
- Copiá los números tal cual figuran. Usá punto decimal (1.234,56 → 1234.56). No inventes datos: si algo no figura, null o 0.
- Una línea por artículo facturado, en el orden del documento. No agregues líneas de subtotales, fletes ni impuestos como artículos (un flete cobrado sí es una línea).
- unidad: KG/LT/MT si la cantidad está en kilos, litros o metros; CAJA si se factura por cajas/bultos; UN para unidades; OTRO si no se entiende.
- Si la factura es A, los precios de línea son netos (sin IVA). Si es B o C, normalmente incluyen IVA: marcá precios_incluyen_iva.
- impuestos: cada IVA por alícuota y cada percepción/impuesto interno por separado con su importe.
- Si hay varias páginas, juntá todas las líneas.`;

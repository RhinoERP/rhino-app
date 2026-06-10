import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { WorkSheet } from "xlsx";
import { INVOICE_TYPE_LABELS } from "@/modules/sales/invoice-type-utils";

/**
 * Formats a date string to DD/MM/YYYY format in Spanish
 */
export function formatExportDate(
  dateString: string | null | undefined
): string {
  if (!dateString) {
    return "—";
  }

  try {
    const date = new Date(dateString);
    return format(date, "dd/MM/yyyy", { locale: es });
  } catch {
    return "—";
  }
}

/**
 * Formats a number as currency for Excel export
 */
export function formatExportCurrency(value: number): string {
  return value.toFixed(2);
}

/**
 * Applies currency format to specific columns in an Excel worksheet
 * This allows Excel to treat the cells as numbers and enable automatic calculations
 */
export function applyCurrencyFormat(
  worksheet: WorkSheet,
  columns: Array<{ id: string; index: number }>,
  rowCount: number
): void {
  if (!worksheet) {
    return;
  }

  const currencyColumnIndices = columns
    .filter((col) =>
      [
        "total_amount",
        "pending_balance",
        "subtotal",
        "subtotal_crudo",
        "subtotal_c_descuentos",
        "taxes",
        "discount",
        "total",
      ].includes(col.id)
    )
    .map((col) => col.index);

  for (const columnIndex of currencyColumnIndices) {
    // Start from row 2 (after headers, 0-indexed)
    for (let row = 2; row <= rowCount + 1; row++) {
      const cellAddress = String.fromCharCode(65 + columnIndex) + row;
      const cell = worksheet[cellAddress];

      if (cell && typeof cell.v === "number") {
        cell.z = "#,##0.00"; // Excel number format for currency with 2 decimals
        cell.t = "n"; // Ensure it's treated as a number
      }
    }
  }
}

/**
 * Translates status labels to Spanish
 */
export const exportStatusLabels = {
  // Sale statuses
  DRAFT: "Preventa",
  CONFIRMED: "Confirmada",
  DISPATCH: "Despachada",
  DELIVERED: "Entregada",
  CANCELLED: "Cancelada",
  INCOMPLETE: "Incompleta",

  // Purchase statuses
  ORDERED: "Ordenada",
  IN_TRANSIT: "En tránsito",
  RECEIVED: "Recibida",

  // Payment statuses
  PENDING: "Pendiente",
  PARTIALLY_PAID: "Pago Parcial",
  PAID: "Pagado",
  OVERDUE: "Vencido",
  PARTIAL: "Parcial",
} as const;

/**
 * Translates invoice type labels to Spanish
 */
export const exportInvoiceTypeLabels = {
  ...INVOICE_TYPE_LABELS,
  NOTA_DE_VENTA: "Nota de Venta",
} as const;

/**
 * Translates column headers to Spanish
 */
export const exportColumnLabels = {
  sale_number: "N° Venta",
  customer: "Cliente",
  supplier: "Proveedor",
  seller: "Vendedor",
  sale_date: "Fecha Venta",
  expiration_date: "Fecha Vencimiento",
  invoice_type: "Tipo Comprobante",
  invoice_number: "N° Comprobante",
  status: "Estado",
  total_amount: "Monto Total",
  payment_status: "Estado Pago",
  pending_balance: "Saldo Pendiente",
  created_at: "Fecha Creación",
  due_date: "Fecha Vencimiento",
  purchase_number: "N° Compra",
  subtotal: "Subtotal",
  taxes: "Impuestos",
  discount: "Descuento",
  total: "Total",
} as const;

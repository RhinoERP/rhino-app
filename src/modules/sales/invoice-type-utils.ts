import type { InvoiceType } from "./types";

export type InvoiceTypeOption = {
  value: InvoiceType;
  label: string;
};

export const INVOICE_TYPE_LABELS: Record<InvoiceType, string> = {
  NOTA_DE_VENTA: "Nota de venta",
  FACTURA_A: "Factura A",
  FACTURA_A_RETENCION: "Factura A con leyenda operación sujeta a retención",
  FACTURA_B: "Factura B",
  FACTURA_C: "Factura C",
  FACTURA_E: "Factura E",
};

export const INVOICE_TYPE_OPTIONS: InvoiceTypeOption[] = [
  { value: "NOTA_DE_VENTA", label: INVOICE_TYPE_LABELS.NOTA_DE_VENTA },
  { value: "FACTURA_A", label: INVOICE_TYPE_LABELS.FACTURA_A },
  {
    value: "FACTURA_A_RETENCION",
    label: INVOICE_TYPE_LABELS.FACTURA_A_RETENCION,
  },
  { value: "FACTURA_B", label: INVOICE_TYPE_LABELS.FACTURA_B },
  { value: "FACTURA_C", label: INVOICE_TYPE_LABELS.FACTURA_C },
  { value: "FACTURA_E", label: INVOICE_TYPE_LABELS.FACTURA_E },
];

export function getInvoiceTypeLabel(invoiceType: InvoiceType): string {
  return INVOICE_TYPE_LABELS[invoiceType];
}

export function getInvoiceTypeLetter(invoiceType: InvoiceType): string {
  if (invoiceType === "FACTURA_A" || invoiceType === "FACTURA_A_RETENCION") {
    return "A";
  }

  if (invoiceType === "FACTURA_B") {
    return "B";
  }

  if (invoiceType === "FACTURA_C") {
    return "C";
  }

  if (invoiceType === "FACTURA_E") {
    return "E";
  }

  return "X";
}

export function isFacturaAInvoiceType(invoiceType: InvoiceType): boolean {
  return invoiceType === "FACTURA_A" || invoiceType === "FACTURA_A_RETENCION";
}

export function isArcaSupportedInvoiceType(invoiceType: InvoiceType): boolean {
  return (
    isFacturaAInvoiceType(invoiceType) ||
    invoiceType === "FACTURA_B" ||
    invoiceType === "FACTURA_C"
  );
}

import type { InvoiceType } from "./types";

export type CreditNoteInvoiceType =
  | "NOTA_DE_CREDITO_A"
  | "NOTA_DE_CREDITO_B"
  | "NOTA_DE_CREDITO_C";

export type DebitNoteInvoiceType =
  | "NOTA_DE_DEBITO_A"
  | "NOTA_DE_DEBITO_B"
  | "NOTA_DE_DEBITO_C";

export type ExtendedInvoiceType = InvoiceType;

export type InvoiceTypeOption = {
  value: InvoiceType;
  label: string;
};

export const ARCA_CBTE_TIPO: Partial<Record<InvoiceType, number>> = {
  FACTURA_A: 1,
  FACTURA_A_RETENCION: 51,
  FACTURA_B: 6,
  FACTURA_C: 11,
  NOTA_DE_CREDITO_A: 3,
  NOTA_DE_CREDITO_B: 8,
  NOTA_DE_CREDITO_C: 13,
  NOTA_DE_DEBITO_A: 2,
  NOTA_DE_DEBITO_B: 7,
  NOTA_DE_DEBITO_C: 12,
};

export const INVOICE_TYPE_LABELS: Record<InvoiceType, string> = {
  NOTA_DE_VENTA: "Nota de venta",
  FACTURA_A: "Factura A",
  FACTURA_A_RETENCION: "Factura A con leyenda operación sujeta a retención",
  FACTURA_B: "Factura B",
  FACTURA_C: "Factura C",
  FACTURA_E: "Factura E",
  NOTA_DE_CREDITO_A: "Nota de crédito A",
  NOTA_DE_CREDITO_B: "Nota de crédito B",
  NOTA_DE_CREDITO_C: "Nota de crédito C",
  NOTA_DE_DEBITO_A: "Nota de débito A",
  NOTA_DE_DEBITO_B: "Nota de débito B",
  NOTA_DE_DEBITO_C: "Nota de débito C",
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

export function isCreditNoteInvoiceType(
  invoiceType: string
): invoiceType is CreditNoteInvoiceType {
  return invoiceType.startsWith("NOTA_DE_CREDITO_");
}

export function isDebitNoteInvoiceType(
  invoiceType: string
): invoiceType is DebitNoteInvoiceType {
  return invoiceType.startsWith("NOTA_DE_DEBITO_");
}

export function getArcaCbteTipo(invoiceType: InvoiceType): number {
  const code = ARCA_CBTE_TIPO[invoiceType];
  if (code === undefined) {
    throw new Error(`Tipo de comprobante sin código ARCA: ${invoiceType}`);
  }
  return code;
}

export function getCreditNoteTypeForInvoice(
  invoiceType: string
): CreditNoteInvoiceType {
  if (invoiceType.includes("FACTURA_A")) {
    return "NOTA_DE_CREDITO_A";
  }
  if (invoiceType.includes("FACTURA_B")) {
    return "NOTA_DE_CREDITO_B";
  }
  return "NOTA_DE_CREDITO_C";
}

export function getDebitNoteTypeForInvoice(
  invoiceType: string
): DebitNoteInvoiceType {
  if (invoiceType.includes("FACTURA_A")) {
    return "NOTA_DE_DEBITO_A";
  }
  if (invoiceType.includes("FACTURA_B")) {
    return "NOTA_DE_DEBITO_B";
  }
  return "NOTA_DE_DEBITO_C";
}

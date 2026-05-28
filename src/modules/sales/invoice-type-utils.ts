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
  // Notas de Crédito y Débito — agregadas al enum en migración 20260526
  NOTA_DE_CREDITO_A: "Nota de Crédito A",
  NOTA_DE_CREDITO_B: "Nota de Crédito B",
  NOTA_DE_CREDITO_C: "Nota de Crédito C",
  NOTA_DE_DEBITO_A: "Nota de Débito A",
  NOTA_DE_DEBITO_B: "Nota de Débito B",
  NOTA_DE_DEBITO_C: "Nota de Débito C",
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
  if (
    invoiceType === "FACTURA_A" ||
    invoiceType === "FACTURA_A_RETENCION" ||
    invoiceType === "NOTA_DE_CREDITO_A" ||
    invoiceType === "NOTA_DE_DEBITO_A"
  ) {
    return "A";
  }
  if (
    invoiceType === "FACTURA_B" ||
    invoiceType === "NOTA_DE_CREDITO_B" ||
    invoiceType === "NOTA_DE_DEBITO_B"
  ) {
    return "B";
  }
  if (
    invoiceType === "FACTURA_C" ||
    invoiceType === "NOTA_DE_CREDITO_C" ||
    invoiceType === "NOTA_DE_DEBITO_C"
  ) {
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

// ─────────────────────────────────────────────────────────────────────────────
// NC/ND extended types — used by credit-note and debit-note services
// InvoiceType now includes all NC/ND values (since migration 20260526)
// ─────────────────────────────────────────────────────────────────────────────

export type CreditNoteInvoiceType =
  | "NOTA_DE_CREDITO_A"
  | "NOTA_DE_CREDITO_B"
  | "NOTA_DE_CREDITO_C";

export type DebitNoteInvoiceType =
  | "NOTA_DE_DEBITO_A"
  | "NOTA_DE_DEBITO_B"
  | "NOTA_DE_DEBITO_C";

/** Alias — InvoiceType already contains NC/ND after migration */
export type ExtendedInvoiceType = InvoiceType;

/** All NC/ND labels (subset of INVOICE_TYPE_LABELS) */
export const EXTENDED_INVOICE_TYPE_LABELS: Record<InvoiceType, string> =
  INVOICE_TYPE_LABELS;

// AFIP WSFE CbteTipo codes
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

export function isCreditNoteInvoiceType(
  invoiceType: InvoiceType
): invoiceType is CreditNoteInvoiceType {
  return (
    invoiceType === "NOTA_DE_CREDITO_A" ||
    invoiceType === "NOTA_DE_CREDITO_B" ||
    invoiceType === "NOTA_DE_CREDITO_C"
  );
}

export function isDebitNoteInvoiceType(
  invoiceType: InvoiceType
): invoiceType is DebitNoteInvoiceType {
  return (
    invoiceType === "NOTA_DE_DEBITO_A" ||
    invoiceType === "NOTA_DE_DEBITO_B" ||
    invoiceType === "NOTA_DE_DEBITO_C"
  );
}

/**
 * Returns the AFIP CbteTipo code for a given invoice type.
 * Throws if the type is not ARCA-supported.
 */
export function getArcaCbteTipo(invoiceType: InvoiceType): number {
  const code = ARCA_CBTE_TIPO[invoiceType];
  if (code === null || code === undefined) {
    throw new Error(
      `El tipo de comprobante "${INVOICE_TYPE_LABELS[invoiceType] ?? invoiceType}" no está soportado en ARCA.`
    );
  }
  return code;
}

export function getCreditNoteTypeForInvoice(
  invoiceType: InvoiceType
): CreditNoteInvoiceType {
  const letter = getInvoiceTypeLetter(invoiceType);
  if (letter === "A") {
    return "NOTA_DE_CREDITO_A";
  }
  if (letter === "C") {
    return "NOTA_DE_CREDITO_C";
  }
  return "NOTA_DE_CREDITO_B";
}

export function getDebitNoteTypeForInvoice(
  invoiceType: InvoiceType
): DebitNoteInvoiceType {
  const letter = getInvoiceTypeLetter(invoiceType);
  if (letter === "A") {
    return "NOTA_DE_DEBITO_A";
  }
  if (letter === "C") {
    return "NOTA_DE_DEBITO_C";
  }
  return "NOTA_DE_DEBITO_B";
}

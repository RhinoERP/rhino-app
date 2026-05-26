import type { InvoiceType } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// NOTE: When the migration 20260526000000_add_credit_debit_notes_arca.sql
// is applied and Supabase types are regenerated, the InvoiceType from the DB
// will automatically include the credit/debit note variants. Until then, we
// extend it here with a local augmentation so the services can be written
// without waiting for type regeneration.
// ─────────────────────────────────────────────────────────────────────────────

export type CreditNoteInvoiceType =
  | "NOTA_DE_CREDITO_A"
  | "NOTA_DE_CREDITO_B"
  | "NOTA_DE_CREDITO_C";

export type DebitNoteInvoiceType =
  | "NOTA_DE_DEBITO_A"
  | "NOTA_DE_DEBITO_B"
  | "NOTA_DE_DEBITO_C";

/** All invoice types — DB enum + credit/debit note variants */
export type ExtendedInvoiceType =
  | InvoiceType
  | CreditNoteInvoiceType
  | DebitNoteInvoiceType;

export type InvoiceTypeOption = {
  value: InvoiceType;
  label: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Labels
// ─────────────────────────────────────────────────────────────────────────────

export const INVOICE_TYPE_LABELS: Record<InvoiceType, string> = {
  NOTA_DE_VENTA: "Nota de venta",
  FACTURA_A: "Factura A",
  FACTURA_A_RETENCION: "Factura A con leyenda operación sujeta a retención",
  FACTURA_B: "Factura B",
  FACTURA_C: "Factura C",
  FACTURA_E: "Factura E",
};

export const EXTENDED_INVOICE_TYPE_LABELS: Record<ExtendedInvoiceType, string> =
  {
    ...INVOICE_TYPE_LABELS,
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

// ─────────────────────────────────────────────────────────────────────────────
// AFIP WSFE CbteTipo codes
// Source: AFIP WSFE WS specification (FECAESolicitar)
// ─────────────────────────────────────────────────────────────────────────────

export const ARCA_CBTE_TIPO: Record<ExtendedInvoiceType, number | null> = {
  NOTA_DE_VENTA: null, // no fiscal
  FACTURA_A: 1,
  FACTURA_A_RETENCION: 51,
  FACTURA_B: 6,
  FACTURA_C: 11,
  FACTURA_E: null, // not yet supported
  NOTA_DE_CREDITO_A: 3,
  NOTA_DE_CREDITO_B: 8,
  NOTA_DE_CREDITO_C: 13,
  NOTA_DE_DEBITO_A: 2,
  NOTA_DE_DEBITO_B: 7,
  NOTA_DE_DEBITO_C: 12,
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function getInvoiceTypeLabel(invoiceType: ExtendedInvoiceType): string {
  return EXTENDED_INVOICE_TYPE_LABELS[invoiceType] ?? invoiceType;
}

export function getInvoiceTypeLetter(invoiceType: ExtendedInvoiceType): string {
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

export function isFacturaAInvoiceType(
  invoiceType: ExtendedInvoiceType
): boolean {
  return invoiceType === "FACTURA_A" || invoiceType === "FACTURA_A_RETENCION";
}

export function isCreditNoteInvoiceType(
  invoiceType: ExtendedInvoiceType
): invoiceType is CreditNoteInvoiceType {
  return (
    invoiceType === "NOTA_DE_CREDITO_A" ||
    invoiceType === "NOTA_DE_CREDITO_B" ||
    invoiceType === "NOTA_DE_CREDITO_C"
  );
}

export function isDebitNoteInvoiceType(
  invoiceType: ExtendedInvoiceType
): invoiceType is DebitNoteInvoiceType {
  return (
    invoiceType === "NOTA_DE_DEBITO_A" ||
    invoiceType === "NOTA_DE_DEBITO_B" ||
    invoiceType === "NOTA_DE_DEBITO_C"
  );
}

export function isArcaSupportedInvoiceType(
  invoiceType: ExtendedInvoiceType
): boolean {
  return ARCA_CBTE_TIPO[invoiceType] !== null;
}

/**
 * Returns the AFIP CbteTipo code for a given invoice type.
 * Throws if the type is not ARCA-supported.
 */
export function getArcaCbteTipo(invoiceType: ExtendedInvoiceType): number {
  const code = ARCA_CBTE_TIPO[invoiceType];
  if (code === null || code === undefined) {
    throw new Error(
      `El tipo de comprobante "${getInvoiceTypeLabel(invoiceType)}" no está soportado en ARCA.`
    );
  }
  return code;
}

/**
 * Returns the matching credit note type for a given sales invoice type.
 * e.g. FACTURA_A → NOTA_DE_CREDITO_A
 */
export function getCreditNoteTypeForInvoice(
  invoiceType: ExtendedInvoiceType
): CreditNoteInvoiceType {
  const letter = getInvoiceTypeLetter(invoiceType);
  if (letter === "A") {
    return "NOTA_DE_CREDITO_A";
  }
  if (letter === "B") {
    return "NOTA_DE_CREDITO_B";
  }
  if (letter === "C") {
    return "NOTA_DE_CREDITO_C";
  }
  return "NOTA_DE_CREDITO_B"; // fallback
}

/**
 * Returns the matching debit note type for a given sales invoice type.
 * e.g. FACTURA_A → NOTA_DE_DEBITO_A
 */
export function getDebitNoteTypeForInvoice(
  invoiceType: ExtendedInvoiceType
): DebitNoteInvoiceType {
  const letter = getInvoiceTypeLetter(invoiceType);
  if (letter === "A") {
    return "NOTA_DE_DEBITO_A";
  }
  if (letter === "B") {
    return "NOTA_DE_DEBITO_B";
  }
  if (letter === "C") {
    return "NOTA_DE_DEBITO_C";
  }
  return "NOTA_DE_DEBITO_B"; // fallback
}

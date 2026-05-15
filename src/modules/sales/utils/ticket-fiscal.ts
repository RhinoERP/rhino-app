import type { InvoiceType, PosInvoiceType } from "../types";

type TicketInvoiceType = InvoiceType | PosInvoiceType;

const COMPACT_DATE_PATTERN = /^(\d{4})(\d{2})(\d{2})$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;

const TICKET_INVOICE_TYPE_LABELS: Record<TicketInvoiceType, string> = {
  FACTURA_A: "Factura A",
  FACTURA_A_RETENCION: "Factura A con leyenda operacion sujeta a retencion",
  FACTURA_B: "Factura B",
  FACTURA_C: "Factura C",
  FACTURA_E: "Factura E",
  NOTA_DE_VENTA: "Nota de venta",
  TICKET_X: "Ticket X",
  PRESUPUESTO: "Presupuesto",
};

export function formatTicketInvoiceType(
  invoiceType: TicketInvoiceType | null | undefined
): string | null {
  if (!invoiceType) {
    return null;
  }

  return TICKET_INVOICE_TYPE_LABELS[invoiceType] ?? invoiceType;
}

export function formatTicketInvoiceReference(params: {
  invoiceType?: TicketInvoiceType | null;
  invoiceNumber?: string | null;
}): string | null {
  const invoiceTypeLabel = formatTicketInvoiceType(params.invoiceType);
  const invoiceNumber = params.invoiceNumber?.trim() || null;

  if (invoiceTypeLabel && invoiceNumber) {
    return `${invoiceTypeLabel} ${invoiceNumber}`;
  }

  return invoiceTypeLabel ?? invoiceNumber;
}

export function formatCaeExpirationDate(
  value: string | null | undefined
): string | null {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    return null;
  }

  const compactMatch = normalizedValue.match(COMPACT_DATE_PATTERN);
  if (compactMatch) {
    return `${compactMatch[3]}/${compactMatch[2]}/${compactMatch[1]}`;
  }

  const isoDateMatch = normalizedValue.match(ISO_DATE_PATTERN);
  if (isoDateMatch) {
    return `${isoDateMatch[3]}/${isoDateMatch[2]}/${isoDateMatch[1]}`;
  }

  const parsed = new Date(normalizedValue);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const day = String(parsed.getDate()).padStart(2, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const year = String(parsed.getFullYear());

  return `${day}/${month}/${year}`;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Efectivo",
  efectivo: "Efectivo",
  credit_card: "Tarjeta de crédito",
  card_credit: "Tarjeta de crédito",
  tarjeta_de_credito: "Tarjeta de crédito",
  tarjeta_credito: "Tarjeta de crédito",
  debit_card: "Tarjeta de débito",
  card_debit: "Tarjeta de débito",
  tarjeta_de_debito: "Tarjeta de débito",
  tarjeta_debito: "Tarjeta de débito",
  transfer: "Transferencia",
  bank_transfer: "Transferencia",
  transferencia: "Transferencia",
  cheque: "Cheque",
  check: "Cheque",
  e_check: "E-cheq",
  echeq: "E-cheq",
  other: "Otro",
  otro: "Otro",
  deposito: "Depósito",
  card: "Tarjeta",
  qr: "QR",
};

function normalizePaymentMethodKey(value: string): string {
  return value.trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
}

export function formatTicketPaymentMethod(
  paymentMethod: string | null | undefined
): string | null {
  const normalizedValue = paymentMethod?.trim();

  if (!normalizedValue) {
    return null;
  }

  return normalizedValue
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      const normalizedKey = normalizePaymentMethodKey(value);
      return PAYMENT_METHOD_LABELS[normalizedKey] ?? value;
    })
    .join(", ");
}

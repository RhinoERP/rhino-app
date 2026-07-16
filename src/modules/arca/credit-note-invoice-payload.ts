import { truncateMoney } from "@/lib/decimal";
import type { Database } from "@/types/supabase";
import { ArcaValidationError } from "./errors";
import { buildArcaReceiverDocument } from "./receiver-document";
import { mapCustomerTaxConditionToArcaReceiverVatConditionId } from "./receiver-tax-conditions";
import {
  ARCA_TAX_CODE_METADATA,
  type ArcaTaxCode,
  normalizeArcaTaxCode,
} from "./tax-codes";

type InvoiceType = Database["public"]["Enums"]["invoice_type"];

export type ArcaCreditNoteInvoiceType =
  | "FACTURA_A"
  | "FACTURA_A_RETENCION"
  | "FACTURA_B"
  | "FACTURA_C";

export type ArcaCreditNoteLoadedTax = {
  id: string;
  taxId: string | null;
  name: string;
  rate: number;
  taxAmount: number;
  baseAmount: number;
  taxCodeSnapshot: string | null;
  currentTaxCode?: string | null;
};

export type ArcaCreditNoteLoadedSale = {
  id: string;
  saleDate: string;
  invoiceType: InvoiceType;
  totalAmount: number;
  arcaPointOfSale: number;
  arcaVoucherNumber: number;
  arcaVoucherTypeCode: number;
  arcaRequestJson?: unknown;
  customer: {
    cuit: string | null;
    taxCondition: string | null;
  };
  taxes: ArcaCreditNoteLoadedTax[];
};

export type ArcaCreditNoteLoadedCreditNote = {
  id: string;
  amount: number;
  invoiceType: InvoiceType;
  taxes?: ArcaCreditNoteLoadedTax[];
  sourceDocuments?: ArcaCreditNoteLoadedSourceDocument[];
};

export type ArcaCreditNoteLoadedSourceDocument = {
  id: string;
  salesOrderId: string | null;
  appliedAmount: number;
  invoiceType: InvoiceType | null;
  invoiceNumber: string | null;
  arcaStatus: string | null;
  arcaPointOfSale: number | null;
  arcaVoucherNumber: number | null;
  arcaVoucherTypeCode: number | null;
  arcaVoucherDate: string | null;
};

export type ArcaCreditNoteVoucherRequestContext = {
  creditNote: ArcaCreditNoteLoadedCreditNote;
  sale: ArcaCreditNoteLoadedSale;
  pointOfSale: number;
  cbteFch?: number;
  associatedVoucherDate?: number;
};

export type ArcaCreditNoteVoucherRequest = {
  Concepto: number;
  DocTipo: number;
  DocNro: number;
  CondicionIVAReceptorId: number;
  CbteFch: number;
  ImpTotal: number;
  ImpTotConc: number;
  ImpNeto: number;
  ImpOpEx: number;
  ImpIVA: number;
  ImpTrib: number;
  MonId: string;
  MonCotiz: number;
  PtoVta: number;
  CbteTipo: number;
  CbtesAsoc: Array<{
    Tipo: number;
    PtoVta: number;
    Nro: number;
    CbteFch: number;
  }>;
  Iva?: Array<{
    Id: number;
    BaseImp: number;
    Importe: number;
  }>;
  Tributos?: Array<{
    Id: number;
    Desc: string;
    BaseImp: number;
    Alic: number;
    Importe: number;
  }>;
};

type ClassifiedSaleTax = ArcaCreditNoteLoadedTax & {
  resolvedCode: ArcaTaxCode;
  classification: {
    kind: "iva" | "tributo";
    arcaId: number;
  };
};

const ARCA_CREDIT_NOTE_VOUCHER_TYPE_MAP: Record<
  ArcaCreditNoteInvoiceType,
  number
> = {
  FACTURA_A: 3,
  FACTURA_A_RETENCION: 53,
  FACTURA_B: 8,
  FACTURA_C: 13,
};
const ARCA_COMPACT_DATE_REGEX = /^\d{8}$/;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function getCurrentArcaDateNumber(): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!(year && month && day)) {
    throw new ArcaValidationError(
      "No se pudo derivar la fecha fiscal de emisión para ARCA."
    );
  }

  return Number(`${year}${month}${day}`);
}

function sanitizeCode(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase();
  return normalized ? normalized : null;
}

export function mapInvoiceTypeToArcaCreditNoteVoucherType(
  invoiceType: InvoiceType
): number {
  if (
    invoiceType === "FACTURA_A" ||
    invoiceType === "FACTURA_A_RETENCION" ||
    invoiceType === "FACTURA_B" ||
    invoiceType === "FACTURA_C"
  ) {
    return ARCA_CREDIT_NOTE_VOUCHER_TYPE_MAP[invoiceType];
  }

  throw new ArcaValidationError(
    `El tipo de comprobante ${invoiceType} todavía no está soportado para emitir notas de crédito ARCA.`
  );
}

function resolveTaxCode(tax: ArcaCreditNoteLoadedTax): ArcaTaxCode {
  const snapshotCode = sanitizeCode(tax.taxCodeSnapshot);
  const currentCode = sanitizeCode(tax.currentTaxCode);

  const resolvedSnapshotCode = snapshotCode
    ? normalizeArcaTaxCode(snapshotCode)
    : null;
  if (resolvedSnapshotCode) {
    return resolvedSnapshotCode;
  }

  const resolvedCurrentCode = currentCode
    ? normalizeArcaTaxCode(currentCode)
    : null;
  if (resolvedCurrentCode) {
    return resolvedCurrentCode;
  }

  throw new ArcaValidationError(
    `El impuesto "${tax.name}" no tiene un código fiscal reconocido para ARCA.`
  );
}

function classifySaleTaxes(sale: ArcaCreditNoteLoadedSale): {
  ivaTaxes: ClassifiedSaleTax[];
  tributeTaxes: ClassifiedSaleTax[];
} {
  return classifyTaxes(sale.taxes);
}

function classifyTaxes(taxes: ArcaCreditNoteLoadedTax[]): {
  ivaTaxes: ClassifiedSaleTax[];
  tributeTaxes: ClassifiedSaleTax[];
} {
  const classifiedTaxes = taxes.map((tax) => {
    const resolvedCode = resolveTaxCode(tax);
    const metadata = ARCA_TAX_CODE_METADATA[resolvedCode];

    return {
      ...tax,
      resolvedCode,
      classification: {
        kind: metadata.kind,
        arcaId: metadata.arcaId,
      },
    };
  });

  const ivaTaxes = classifiedTaxes.filter(
    (tax) => tax.classification.kind === "iva"
  );
  const tributeTaxes = classifiedTaxes.filter(
    (tax) => tax.classification.kind === "tributo"
  );

  return { ivaTaxes, tributeTaxes };
}

function extractAssociatedVoucherDateFromRequest(
  value: unknown
): number | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const maybeRequest = value as {
    wsfeRequest?: { CbteFch?: unknown };
  };
  const cbteFch = maybeRequest.wsfeRequest?.CbteFch;

  if (typeof cbteFch === "number" && Number.isInteger(cbteFch)) {
    return cbteFch;
  }

  if (typeof cbteFch === "string" && ARCA_COMPACT_DATE_REGEX.test(cbteFch)) {
    return Number(cbteFch);
  }

  return null;
}

function formatDateToArcaDateNumber(value: string): number {
  const dateOnly = value.includes("T") ? value.slice(0, 10) : value;

  if (!ISO_DATE_REGEX.test(dateOnly)) {
    throw new ArcaValidationError(
      "La venta original no tiene una fecha válida para asociar el comprobante fiscal."
    );
  }

  return Number(dateOnly.replaceAll("-", ""));
}

export function resolveAssociatedVoucherDate(
  sale: ArcaCreditNoteLoadedSale
): number {
  return (
    extractAssociatedVoucherDateFromRequest(sale.arcaRequestJson) ??
    formatDateToArcaDateNumber(sale.saleDate)
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: supports legacy prorated and itemized fiscal NC paths.
function buildCreditNoteAmounts(params: {
  creditNote: ArcaCreditNoteLoadedCreditNote;
  sale: ArcaCreditNoteLoadedSale;
}): Pick<
  ArcaCreditNoteVoucherRequest,
  "ImpNeto" | "ImpIVA" | "ImpTrib" | "Iva" | "Tributos"
> {
  const creditNoteAmount = truncateMoney(params.creditNote.amount);
  const creditNoteTaxes = params.creditNote.taxes ?? [];

  if (creditNoteTaxes.length > 0) {
    const { ivaTaxes: itemizedIvaTaxes, tributeTaxes: itemizedTributeTaxes } =
      classifyTaxes(creditNoteTaxes);
    const ivaAmount = truncateMoney(
      itemizedIvaTaxes.reduce((total, tax) => total + tax.taxAmount, 0)
    );
    const tributeAmount = truncateMoney(
      itemizedTributeTaxes.reduce((total, tax) => total + tax.taxAmount, 0)
    );
    const taxableBase = truncateMoney(
      creditNoteAmount - ivaAmount - tributeAmount
    );

    if (!Number.isFinite(taxableBase) || taxableBase < 0) {
      throw new ArcaValidationError(
        "No se pudo derivar la base imponible fiscal de la nota de crédito."
      );
    }

    return {
      ImpNeto: taxableBase,
      ImpIVA: ivaAmount,
      ImpTrib: tributeAmount,
      ...(itemizedIvaTaxes.length > 0
        ? {
            Iva: itemizedIvaTaxes.map((tax) => ({
              Id: tax.classification.arcaId,
              BaseImp: truncateMoney(tax.baseAmount),
              Importe: truncateMoney(tax.taxAmount),
            })),
          }
        : {}),
      ...(itemizedTributeTaxes.length > 0
        ? {
            Tributos: itemizedTributeTaxes.map((tax) => ({
              Id: tax.classification.arcaId,
              Desc: tax.name,
              BaseImp: truncateMoney(tax.baseAmount),
              Alic: truncateMoney(tax.rate),
              Importe: truncateMoney(tax.taxAmount),
            })),
          }
        : {}),
    };
  }

  const saleTotal = truncateMoney(params.sale.totalAmount);

  if (saleTotal <= 0) {
    throw new ArcaValidationError(
      "La venta original no tiene un total válido para calcular importes fiscales."
    );
  }

  if (creditNoteAmount <= 0 || creditNoteAmount > saleTotal + 0.01) {
    throw new ArcaValidationError(
      "La nota de crédito no tiene un importe válido para emitir en ARCA."
    );
  }

  const isTotalCreditNote = Math.abs(creditNoteAmount - saleTotal) <= 0.01;
  const ratio = isTotalCreditNote ? 1 : creditNoteAmount / saleTotal;
  const { ivaTaxes, tributeTaxes } = classifySaleTaxes(params.sale);

  const scaledIvaTaxes = ivaTaxes.map((tax) => ({
    ...tax,
    baseAmount: truncateMoney(tax.baseAmount * ratio),
    taxAmount: truncateMoney(tax.taxAmount * ratio),
  }));
  const scaledTributeTaxes = tributeTaxes.map((tax) => ({
    ...tax,
    baseAmount: truncateMoney(tax.baseAmount * ratio),
    taxAmount: truncateMoney(tax.taxAmount * ratio),
  }));

  const ivaAmount = truncateMoney(
    scaledIvaTaxes.reduce((total, tax) => total + tax.taxAmount, 0)
  );
  const tributeAmount = truncateMoney(
    scaledTributeTaxes.reduce((total, tax) => total + tax.taxAmount, 0)
  );
  const taxableBase = truncateMoney(
    creditNoteAmount - ivaAmount - tributeAmount
  );

  if (!Number.isFinite(taxableBase) || taxableBase < 0) {
    throw new ArcaValidationError(
      "No se pudo derivar la base imponible fiscal de la nota de crédito."
    );
  }

  return {
    ImpNeto: taxableBase,
    ImpIVA: ivaAmount,
    ImpTrib: tributeAmount,
    ...(scaledIvaTaxes.length > 0
      ? {
          Iva: scaledIvaTaxes.map((tax) => ({
            Id: tax.classification.arcaId,
            BaseImp: taxableBase,
            Importe: truncateMoney(tax.taxAmount),
          })),
        }
      : {}),
    ...(scaledTributeTaxes.length > 0
      ? {
          Tributos: scaledTributeTaxes.map((tax) => ({
            Id: tax.classification.arcaId,
            Desc: tax.name,
            BaseImp: truncateMoney(tax.baseAmount),
            Alic: truncateMoney(tax.rate),
            Importe: truncateMoney(tax.taxAmount),
          })),
        }
      : {}),
  };
}

export function buildArcaCreditNoteVoucherRequest(
  context: ArcaCreditNoteVoucherRequestContext
): ArcaCreditNoteVoucherRequest {
  const voucherTypeCode = mapInvoiceTypeToArcaCreditNoteVoucherType(
    context.creditNote.invoiceType
  );
  const receiverDocument = buildArcaReceiverDocument({
    customerCuit: context.sale.customer.cuit,
    customerTaxCondition: context.sale.customer.taxCondition,
    invoiceType: context.creditNote.invoiceType,
    totalAmount: context.creditNote.amount,
  });
  const receiverVatConditionId =
    mapCustomerTaxConditionToArcaReceiverVatConditionId(
      context.sale.customer.taxCondition
    );
  const amounts = buildCreditNoteAmounts({
    creditNote: context.creditNote,
    sale: context.sale,
  });
  const sourceDocuments = context.creditNote.sourceDocuments ?? [];
  const associatedVouchers =
    sourceDocuments.length > 0
      ? sourceDocuments.map((source) => {
          if (
            !(
              source.arcaPointOfSale &&
              source.arcaVoucherNumber &&
              source.arcaVoucherTypeCode
            )
          ) {
            throw new ArcaValidationError(
              "Todas las facturas asociadas a la nota de crédito deben tener comprobante ARCA autorizado."
            );
          }

          return {
            Tipo: source.arcaVoucherTypeCode,
            PtoVta: source.arcaPointOfSale,
            Nro: source.arcaVoucherNumber,
            CbteFch: source.arcaVoucherDate
              ? formatDateToArcaDateNumber(source.arcaVoucherDate)
              : (context.associatedVoucherDate ??
                resolveAssociatedVoucherDate(context.sale)),
          };
        })
      : [
          {
            Tipo: context.sale.arcaVoucherTypeCode,
            PtoVta: context.sale.arcaPointOfSale,
            Nro: context.sale.arcaVoucherNumber,
            CbteFch:
              context.associatedVoucherDate ??
              resolveAssociatedVoucherDate(context.sale),
          },
        ];

  return {
    Concepto: 1,
    DocTipo: receiverDocument.documentType,
    DocNro: receiverDocument.documentNumber,
    CondicionIVAReceptorId: receiverVatConditionId,
    CbteFch: context.cbteFch ?? getCurrentArcaDateNumber(),
    ImpTotal: truncateMoney(context.creditNote.amount),
    ImpTotConc: 0,
    ImpOpEx: 0,
    MonId: "PES",
    MonCotiz: 1,
    PtoVta: context.pointOfSale,
    CbteTipo: voucherTypeCode,
    CbtesAsoc: associatedVouchers,
    ...amounts,
  };
}

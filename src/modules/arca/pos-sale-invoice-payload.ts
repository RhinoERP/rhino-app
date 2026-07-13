import { truncateMoney } from "../../lib/decimal";
import { formatDateToArcaDateNumber } from "./arca-qr";
import { ArcaValidationError } from "./errors";
import {
  ARCA_TAX_CODE_METADATA,
  type ArcaTaxCode,
  normalizeArcaTaxCode,
} from "./tax-codes";
import { normalizeCuit } from "./validation";

export type PosArcaInvoiceType = "FACTURA_B" | "FACTURA_C";

export type PosArcaLoadedTax = {
  id: string;
  taxId: string | null;
  name: string;
  rate: number;
  taxAmount: number;
  baseAmount: number;
  taxCodeSnapshot: string | null;
};

export type PosArcaLoadedSale = {
  id: string;
  totalAmount: number;
  taxAmount: number | null;
  customer: {
    cuit: string | null;
  } | null;
  taxes: PosArcaLoadedTax[];
};

export type PosArcaVoucherRequestContext = {
  sale: PosArcaLoadedSale;
  invoiceType: PosArcaInvoiceType;
  pointOfSale: number;
  cbteFch?: number;
};

export type ArcaPosVoucherRequest = {
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
  CbteDesde?: number;
  CbteHasta?: number;
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

type ClassifiedPosSaleTax = PosArcaLoadedTax & {
  resolvedCode: ArcaTaxCode;
  classification: {
    kind: "iva" | "tributo";
    arcaId: number;
  };
};

const CONSUMIDOR_FINAL_DOC_TYPE = 99;
const CONSUMIDOR_FINAL_DOC_NUMBER = 0;
const CUIT_DOC_TYPE = 80;
const CONSUMIDOR_FINAL_IDENTIFICATION_THRESHOLD = 10_000_000;
const CONSUMIDOR_FINAL_VAT_CONDITION_ID = 5;
const TAXPAYER_CUIT_REGEX = /^\d{11}$/;

const ARCA_POS_VOUCHER_TYPE_MAP: Record<PosArcaInvoiceType, number> = {
  FACTURA_B: 6,
  FACTURA_C: 11,
};

function getCurrentArcaDateNumber(): number {
  try {
    return formatDateToArcaDateNumber(new Date());
  } catch {
    throw new ArcaValidationError(
      "No se pudo derivar la fecha fiscal de emisión para ARCA."
    );
  }
}

function buildConsumerFinalReceiverDocument(sale: PosArcaLoadedSale): {
  documentType: number;
  documentNumber: number;
} {
  if (sale.totalAmount < CONSUMIDOR_FINAL_IDENTIFICATION_THRESHOLD) {
    return {
      documentType: CONSUMIDOR_FINAL_DOC_TYPE,
      documentNumber: CONSUMIDOR_FINAL_DOC_NUMBER,
    };
  }

  if (!sale.customer?.cuit?.trim()) {
    throw new ArcaValidationError(
      "Para consumidor final con operaciones de $10.000.000 o más, ARCA exige CUIT/CUIL del receptor. Cargá el CUIT/CUIL del cliente antes de emitir."
    );
  }

  const normalizedCuit = normalizeCuit(sale.customer.cuit);

  if (!TAXPAYER_CUIT_REGEX.test(normalizedCuit)) {
    throw new ArcaValidationError(
      "El CUIT/CUIL del cliente no tiene un formato válido para emitir en ARCA."
    );
  }

  return {
    documentType: CUIT_DOC_TYPE,
    documentNumber: Number(normalizedCuit),
  };
}

function resolveTaxCode(tax: PosArcaLoadedTax): ArcaTaxCode {
  const resolvedCode = normalizeArcaTaxCode(tax.taxCodeSnapshot);

  if (!resolvedCode) {
    throw new ArcaValidationError(
      `El impuesto "${tax.name}" no tiene un código fiscal ARCA válido en el snapshot del ticket.`
    );
  }

  return resolvedCode;
}

function classifyPosSaleTaxes(sale: PosArcaLoadedSale): {
  ivaTaxes: ClassifiedPosSaleTax[];
  tributeTaxes: ClassifiedPosSaleTax[];
} {
  const classifiedTaxes = sale.taxes.map((tax) => {
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

function assertFacturaCTaxState(sale: PosArcaLoadedSale): void {
  const persistedTaxAmount = truncateMoney(Number(sale.taxAmount ?? 0));

  if (persistedTaxAmount > 0 || sale.taxes.length > 0) {
    throw new ArcaValidationError(
      "Factura C para venta POS no debe tener impuestos IVA/tributos asociados."
    );
  }
}

function assertFacturaBTaxSnapshot(sale: PosArcaLoadedSale): void {
  if (
    sale.taxes.length === 0 &&
    truncateMoney(Number(sale.taxAmount ?? 0)) > 0
  ) {
    throw new ArcaValidationError(
      "Esta venta POS tiene impuestos en el total pero no tiene snapshot fiscal. No se puede emitir en ARCA."
    );
  }
}

function buildFacturaBAmounts(
  sale: PosArcaLoadedSale
): Pick<
  ArcaPosVoucherRequest,
  "ImpNeto" | "ImpIVA" | "ImpTrib" | "Iva" | "Tributos"
> {
  assertFacturaBTaxSnapshot(sale);

  const { ivaTaxes, tributeTaxes } = classifyPosSaleTaxes(sale);
  const tributeAmount = truncateMoney(
    tributeTaxes.reduce((total, tax) => total + tax.taxAmount, 0)
  );
  const ivaAmount = truncateMoney(
    ivaTaxes.reduce((total, tax) => total + tax.taxAmount, 0)
  );

  let taxableBase = 0;

  if (ivaTaxes.length > 0) {
    taxableBase = truncateMoney(
      ivaTaxes.reduce((total, tax) => total + tax.baseAmount, 0)
    );
  } else if (tributeTaxes.length > 0) {
    taxableBase = truncateMoney(sale.totalAmount - tributeAmount);
  } else {
    taxableBase = truncateMoney(sale.totalAmount);
  }

  if (!Number.isFinite(taxableBase) || taxableBase < 0) {
    throw new ArcaValidationError(
      "No se pudo derivar la base imponible fiscal del ticket POS."
    );
  }

  if (taxableBase > 0 && ivaTaxes.length === 0) {
    throw new ArcaValidationError(
      "Factura B requiere un impuesto IVA con código fiscal ARCA en el ticket. Configurá un IVA predeterminado para venta directa o emití Factura C si corresponde."
    );
  }

  const expectedTotal = truncateMoney(taxableBase + ivaAmount + tributeAmount);
  if (Math.abs(expectedTotal - sale.totalAmount) > 0.01) {
    throw new ArcaValidationError(
      "El ticket POS no tiene un snapshot fiscal consistente para derivar ImpNeto en ARCA."
    );
  }

  return {
    ImpNeto: taxableBase,
    ImpIVA: ivaAmount,
    ImpTrib: tributeAmount,
    ...(ivaTaxes.length > 0
      ? {
          Iva: ivaTaxes.map((tax) => ({
            Id: tax.classification.arcaId,
            BaseImp: truncateMoney(tax.baseAmount),
            Importe: truncateMoney(tax.taxAmount),
          })),
        }
      : {}),
    ...(tributeTaxes.length > 0
      ? {
          Tributos: tributeTaxes.map((tax) => ({
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

export function buildArcaVoucherRequestFromPosSale(
  context: PosArcaVoucherRequestContext
): ArcaPosVoucherRequest {
  const receiverDocument = buildConsumerFinalReceiverDocument(context.sale);
  const voucherTypeCode = ARCA_POS_VOUCHER_TYPE_MAP[context.invoiceType];

  const amounts =
    context.invoiceType === "FACTURA_C"
      ? (() => {
          assertFacturaCTaxState(context.sale);
          return {
            ImpNeto: truncateMoney(context.sale.totalAmount),
            ImpIVA: 0,
            ImpTrib: 0,
          };
        })()
      : buildFacturaBAmounts(context.sale);

  return {
    Concepto: 1,
    DocTipo: receiverDocument.documentType,
    DocNro: receiverDocument.documentNumber,
    CondicionIVAReceptorId: CONSUMIDOR_FINAL_VAT_CONDITION_ID,
    CbteFch: context.cbteFch ?? getCurrentArcaDateNumber(),
    ImpTotal: truncateMoney(context.sale.totalAmount),
    ImpTotConc: 0,
    ImpOpEx: 0,
    MonId: "PES",
    MonCotiz: 1,
    PtoVta: context.pointOfSale,
    CbteTipo: voucherTypeCode,
    ...amounts,
  };
}

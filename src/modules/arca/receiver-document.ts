import {
  type CustomerTaxCondition,
  normalizeCustomerTaxCondition,
} from "@/modules/customers/tax-conditions";
import { isFacturaAInvoiceType } from "@/modules/sales/invoice-type-utils";
import type { Database } from "@/types/supabase";
import { ArcaValidationError } from "./errors";
import { normalizeCuit } from "./validation";

type InvoiceType = Database["public"]["Enums"]["invoice_type"];

type ReceiverDocument = {
  documentType: number;
  documentNumber: number;
};

const TAXPAYER_CUIT_REGEX = /^\d{11}$/;
const CONSUMIDOR_FINAL_DOC_TYPE = 99;
const CONSUMIDOR_FINAL_DOC_NUMBER = 0;
const CUIT_DOC_TYPE = 80;
const CONSUMIDOR_FINAL_IDENTIFICATION_THRESHOLD = 10_000_000;

function buildReceiverDocumentFromCuit(
  cuit: string | null | undefined
): ReceiverDocument {
  if (!cuit?.trim()) {
    throw new ArcaValidationError(
      "El cliente necesita un CUIT válido para emitir este comprobante en ARCA."
    );
  }

  const normalizedCuit = normalizeCuit(cuit);

  if (!TAXPAYER_CUIT_REGEX.test(normalizedCuit)) {
    throw new ArcaValidationError(
      "El CUIT del cliente no tiene un formato válido para emitir en ARCA."
    );
  }

  return {
    documentType: CUIT_DOC_TYPE,
    documentNumber: Number(normalizedCuit),
  };
}

function resolveNormalizedTaxCondition(
  value: string | null | undefined
): CustomerTaxCondition {
  const normalized = normalizeCustomerTaxCondition(value);

  if (!normalized) {
    throw new ArcaValidationError(
      "La condición fiscal del cliente no tiene un formato válido para ARCA."
    );
  }

  return normalized;
}

export function buildArcaReceiverDocument(params: {
  customerCuit: string | null | undefined;
  customerTaxCondition: string | null | undefined;
  invoiceType: InvoiceType;
  totalAmount: number;
}): ReceiverDocument {
  const taxCondition = resolveNormalizedTaxCondition(
    params.customerTaxCondition
  );

  if (isFacturaAInvoiceType(params.invoiceType)) {
    return buildReceiverDocumentFromCuit(params.customerCuit);
  }

  if (taxCondition === "CONSUMIDOR_FINAL") {
    if (params.totalAmount < CONSUMIDOR_FINAL_IDENTIFICATION_THRESHOLD) {
      return {
        documentType: CONSUMIDOR_FINAL_DOC_TYPE,
        documentNumber: CONSUMIDOR_FINAL_DOC_NUMBER,
      };
    }

    if (params.customerCuit?.trim()) {
      return buildReceiverDocumentFromCuit(params.customerCuit);
    }

    throw new ArcaValidationError(
      "Para consumidor final con operaciones de $10.000.000 o más, ARCA exige identificación del receptor. Cargá CUIT/CUIL/DNI antes de emitir."
    );
  }

  return buildReceiverDocumentFromCuit(params.customerCuit);
}

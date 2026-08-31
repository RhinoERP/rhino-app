import { truncateMoney } from "../../lib/decimal";

const ARGENTINA_TIME_ZONE = "America/Argentina/Buenos_Aires";
const ARCA_QR_BASE_URL = "https://www.arca.gob.ar/fe/qr/";

type GlobalWithBuffer = typeof globalThis & {
  Buffer?: {
    from: (
      value: string,
      encoding: "utf-8"
    ) => {
      toString: (encoding: "base64") => string;
    };
  };
};

export type ArcaQrPayload = {
  ver: 1;
  fecha: string;
  cuit: number;
  ptoVta: number;
  tipoCmp: number;
  nroCmp: number;
  importe: number;
  moneda: string;
  ctz: number;
  tipoDocRec?: number;
  nroDocRec?: number;
  tipoCodAut: "E";
  codAut: number;
};

export type BuildArcaQrPayloadInput = {
  issueDate: string | Date | number;
  issuerCuit: string | number;
  pointOfSale: number;
  voucherTypeCode: number;
  voucherNumber: number;
  totalAmount: number;
  currency?: string | null;
  currencyRate?: number | null;
  receiverDocumentType?: number | null;
  receiverDocumentNumber?: number | null;
  authorizationCode: string | number;
};

function getArgentinaDateParts(value: string | Date | number): {
  year: string;
  month: string;
  day: string;
} {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error("No se pudo derivar la fecha fiscal de emisión ARCA.");
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ARGENTINA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!(year && month && day)) {
    throw new Error("No se pudo derivar la fecha fiscal de emisión ARCA.");
  }

  return { year, month, day };
}

export function formatDateToArgentinaIsoDate(
  value: string | Date | number
): string {
  const { year, month, day } = getArgentinaDateParts(value);
  return `${year}-${month}-${day}`;
}

export function formatDateToArcaDateNumber(
  value: string | Date | number
): number {
  const { year, month, day } = getArgentinaDateParts(value);
  return Number(`${year}${month}${day}`);
}

function normalizeNumericIdentifier(value: string | number): number {
  const normalized =
    typeof value === "number" ? String(value) : value.replace(/\D/g, "");
  const parsed = Number(normalized);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Identificador fiscal inválido para QR ARCA.");
  }

  return parsed;
}

function encodeStandardBase64(value: string): string {
  const globalValue = globalThis as GlobalWithBuffer;

  if (globalValue.Buffer) {
    return globalValue.Buffer.from(value, "utf-8").toString("base64");
  }

  const bytes = new TextEncoder().encode(value);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

export function buildArcaQrPayload(
  input: BuildArcaQrPayloadInput
): ArcaQrPayload {
  const currency = input.currency?.trim() || "PES";
  const suppliedCurrencyRate = input.currencyRate;
  const hasValidCurrencyRate =
    typeof suppliedCurrencyRate === "number" &&
    Number.isFinite(suppliedCurrencyRate) &&
    suppliedCurrencyRate > 0;

  if (currency === "DOL" && !hasValidCurrencyRate) {
    throw new Error(
      "Un comprobante USD necesita una cotización fiscal autorizada para generar el QR ARCA."
    );
  }

  const currencyRate = suppliedCurrencyRate ?? 1;

  const payload: ArcaQrPayload = {
    ver: 1,
    fecha: formatDateToArgentinaIsoDate(input.issueDate),
    cuit: normalizeNumericIdentifier(input.issuerCuit),
    ptoVta: input.pointOfSale,
    tipoCmp: input.voucherTypeCode,
    nroCmp: input.voucherNumber,
    importe: truncateMoney(input.totalAmount),
    moneda: currency,
    ctz: currencyRate,
    tipoCodAut: "E",
    codAut: normalizeNumericIdentifier(input.authorizationCode),
  };

  if (
    typeof input.receiverDocumentType === "number" &&
    Number.isFinite(input.receiverDocumentType)
  ) {
    payload.tipoDocRec = input.receiverDocumentType;
  }

  if (
    typeof input.receiverDocumentNumber === "number" &&
    Number.isFinite(input.receiverDocumentNumber)
  ) {
    payload.nroDocRec = input.receiverDocumentNumber;
  }

  return payload;
}

export function buildArcaQrVerifierUrl(payload: ArcaQrPayload): string {
  const base64Payload = encodeStandardBase64(JSON.stringify(payload));
  return `${ARCA_QR_BASE_URL}?p=${encodeURIComponent(base64Payload)}`;
}

export function buildArcaQrVerifierUrlFromInput(
  input: BuildArcaQrPayloadInput
): string {
  return buildArcaQrVerifierUrl(buildArcaQrPayload(input));
}

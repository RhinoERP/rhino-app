import { ArcaValidationError } from "./errors";

export type ArcaFiscalCurrency = {
  code: "PES" | "DOL";
  rate: number | null;
  sameCurrencySettlement: boolean;
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function positiveNumber(value: unknown): number | null {
  let parsed: number | null = null;
  if (typeof value === "number") {
    parsed = value;
  } else if (typeof value === "string") {
    parsed = Number(value);
  }

  return typeof parsed === "number" && Number.isFinite(parsed) && parsed > 0
    ? parsed
    : null;
}

export function buildInvoiceFiscalCurrency(
  saleCurrency: string | null | undefined
): ArcaFiscalCurrency {
  return saleCurrency === "USD"
    ? { code: "DOL", rate: null, sameCurrencySettlement: true }
    : { code: "PES", rate: 1, sameCurrencySettlement: false };
}

/** Reads the immutable fiscal snapshot persisted when the source invoice was authorized. */
export function readAuthorizedFiscalCurrency(
  requestJson: unknown
): ArcaFiscalCurrency {
  const root = asRecord(requestJson);
  const snapshot = asRecord(root?.fiscalCurrency);
  const request = asRecord(root?.wsfeRequest);
  const code = snapshot?.code ?? request?.MonId;

  if (code === "PES" || !code) {
    return { code: "PES", rate: 1, sameCurrencySettlement: false };
  }

  if (code !== "DOL") {
    throw new ArcaValidationError(
      `La moneda fiscal ${String(code)} no está soportada para notas ARCA.`
    );
  }

  const rate =
    positiveNumber(snapshot?.rate) ?? positiveNumber(request?.MonCotiz);
  if (!rate) {
    throw new ArcaValidationError(
      "La factura USD no tiene una cotización fiscal autorizada. Conciliá el comprobante en ARCA antes de emitir una nota."
    );
  }

  return {
    code: "DOL",
    rate,
    sameCurrencySettlement:
      snapshot?.sameCurrencySettlement === true ||
      request?.CanMisMonExt === "S",
  };
}

/** Finds MonCotiz in ARCA voucher-info responses without coupling to their nesting. */
export function findArcaCurrencyRate(value: unknown): number | null {
  const current = asRecord(value);
  const rate = positiveNumber(current?.MonCotiz);
  if (rate) {
    return rate;
  }
  if (!current) {
    return null;
  }

  for (const nested of Object.values(current)) {
    const found = findArcaCurrencyRate(nested);
    if (found) {
      return found;
    }
  }
  return null;
}

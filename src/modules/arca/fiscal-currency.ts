import { ArcaValidationError } from "./errors";

export type ArcaFiscalCurrency = {
  code: "PES" | "DOL";
  rate: number | null;
  sameCurrencySettlement: boolean;
};

export type AuthorizedArcaFiscalCurrency = Omit<ArcaFiscalCurrency, "rate"> & {
  rate: number;
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

export function buildArcaCurrencyRequestFields(
  currency: AuthorizedArcaFiscalCurrency
): {
  MonId: "PES" | "DOL";
  MonCotiz: number;
  CanMisMonExt?: "S";
} {
  return {
    MonId: currency.code,
    MonCotiz: currency.rate,
    ...(currency.sameCurrencySettlement ? { CanMisMonExt: "S" as const } : {}),
  };
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

import { ArcaValidationError } from "./errors";

export type ArcaFiscalCurrency = {
  code: "PES" | "DOL";
  rate: number | null;
  sameCurrencySettlement: boolean;
};

export type AuthorizedArcaFiscalCurrency = Omit<ArcaFiscalCurrency, "rate"> & {
  rate: number;
};

export type ArcaCurrencyQuoteClient = {
  ElectronicBilling?: {
    executeRequest?: (
      operation: string,
      params: Record<string, unknown>
    ) => Promise<unknown>;
  };
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

/**
 * Resolves the official ARCA quote required when an invoice is settled in USD.
 * The SDK exposes the generic WSFE executor at runtime but does not declare it
 * in its TypeScript surface, so the narrow adapter lives here.
 */
export async function resolveArcaFiscalCurrency(
  client: ArcaCurrencyQuoteClient,
  currency: ArcaFiscalCurrency
): Promise<AuthorizedArcaFiscalCurrency> {
  if (currency.rate) {
    return { ...currency, rate: currency.rate };
  }

  const executeRequest = client.ElectronicBilling?.executeRequest;
  if (!executeRequest) {
    throw new ArcaValidationError(
      "El cliente ARCA no permite consultar la cotización fiscal requerida para emitir en USD."
    );
  }

  let response: unknown;
  try {
    response = await executeRequest.call(
      client.ElectronicBilling,
      "FEParamGetCotizacion",
      { MonId: currency.code }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ArcaValidationError(
      `No se pudo obtener la cotización fiscal ARCA para USD: ${message}`
    );
  }

  const rate = findArcaCurrencyRate(response);
  if (!rate) {
    throw new ArcaValidationError(
      "ARCA no devolvió una cotización fiscal válida para USD."
    );
  }

  return { ...currency, rate };
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

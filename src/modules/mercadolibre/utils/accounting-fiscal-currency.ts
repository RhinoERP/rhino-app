import { z } from "zod";
import { readAuthorizedFiscalCurrency } from "@/modules/arca/fiscal-currency";

const requestSchema = z.object({
  fiscalCurrency: z
    .object({ code: z.string(), rate: z.unknown().optional() })
    .optional(),
  wsfeRequest: z
    .object({ MonId: z.string(), MonCotiz: z.unknown().optional() })
    .optional(),
});

function fiscalRate(value: unknown): number | undefined {
  if (value === undefined) {
    return;
  }
  if (
    !(
      typeof value === "number" ||
      (typeof value === "string" && value.trim().length > 0)
    )
  ) {
    throw new Error("La cotización fiscal autorizada es inválida.");
  }
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("La cotización fiscal autorizada es inválida.");
  }
  return rate;
}

function validateSnapshot(
  snapshot: z.output<typeof requestSchema>["fiscalCurrency"],
  request: z.output<typeof requestSchema>["wsfeRequest"],
  currency: "ARS" | "USD"
) {
  if (snapshot && request && snapshot.code !== request.MonId) {
    throw new Error("Las monedas del snapshot fiscal autorizado no coinciden.");
  }
  const snapshotRate = fiscalRate(snapshot?.rate);
  const requestRate = fiscalRate(request?.MonCotiz);
  if (
    snapshotRate !== undefined &&
    requestRate !== undefined &&
    snapshotRate !== requestRate
  ) {
    throw new Error(
      "Las cotizaciones del snapshot fiscal autorizado no coinciden."
    );
  }
  if (
    currency === "ARS" &&
    ((snapshotRate !== undefined && snapshotRate !== 1) ||
      (requestRate !== undefined && requestRate !== 1))
  ) {
    throw new Error("La cotización fiscal en pesos debe ser 1.");
  }
}

export function getMeliAccountingFiscalCurrency(
  currency: "ARS" | "USD",
  authorizedRequest: unknown
) {
  const parsed = requestSchema.safeParse(authorizedRequest);
  if (
    !(
      parsed.success &&
      (parsed.data.fiscalCurrency?.code || parsed.data.wsfeRequest?.MonId)
    )
  ) {
    throw new Error("Falta la moneda fiscal autorizada de la factura Meli.");
  }
  const expectedCode = currency === "USD" ? "DOL" : "PES";
  if (
    (parsed.data.fiscalCurrency?.code ?? parsed.data.wsfeRequest?.MonId) !==
    expectedCode
  ) {
    throw new Error(
      "La moneda fiscal autorizada no coincide con la moneda de la venta Meli."
    );
  }
  validateSnapshot(
    parsed.data.fiscalCurrency,
    parsed.data.wsfeRequest,
    currency
  );
  const fiscalCurrency = readAuthorizedFiscalCurrency(authorizedRequest);
  if (currency === "USD" && fiscalCurrency.rate === null) {
    throw new Error(
      "La factura USD no tiene una cotización fiscal autorizada."
    );
  }

  return {
    currency,
    exchangeRate: fiscalCurrency.rate,
  };
}

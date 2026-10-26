import { ArcaValidationError } from "./errors";

/** Customer-facing commercial quote. Never infer it from the ARCA fiscal rate. */
export function formatCommercialExchangeRate(
  currency: string | null | undefined,
  rate: number | null | undefined
): string | null {
  if (currency !== "USD") {
    return null;
  }

  if (
    rate === null ||
    rate === undefined ||
    !Number.isFinite(rate) ||
    rate <= 0
  ) {
    return "no disponible";
  }

  return `1 USD = ARS ${new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(rate)}`;
}

export function requireCommercialExchangeRateForUsdInvoice(
  currency: string | null | undefined,
  rate: number | null | undefined
): void {
  if (
    currency === "USD" &&
    (rate === null || rate === undefined || !Number.isFinite(rate) || rate <= 0)
  ) {
    throw new ArcaValidationError(
      "Antes de emitir una factura USD, cargá el tipo de cambio comercial en el detalle de la venta."
    );
  }
}

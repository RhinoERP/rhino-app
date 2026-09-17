import { truncateToDecimals } from "@/lib/decimal";

/**
 * Convierte un precio calculado en la moneda del producto a la moneda del
 * presupuesto. Si ambas monedas coinciden o no hay tipo de cambio válido,
 * devuelve el precio sin cambios.
 *
 * Usa precisión interna de 6 decimales para que la conversión de moneda no
 * pierda centavos al multiplicar por la cantidad. El truncamiento a 2
 * decimales ocurre solo sobre los totales finales.
 */
const CONVERSION_PRECISION = 6;

export function convertPriceToQuoteCurrency(
  price: number,
  productCurrency: string | null | undefined,
  quoteCurrency: string,
  exchangeRate: number | null | undefined
): number {
  if (!productCurrency || productCurrency === quoteCurrency) {
    return price;
  }
  if (!exchangeRate || exchangeRate <= 0) {
    return price;
  }
  if (productCurrency === "USD" && quoteCurrency === "ARS") {
    return truncateToDecimals(price * exchangeRate, CONVERSION_PRECISION);
  }
  if (productCurrency === "ARS" && quoteCurrency === "USD") {
    return truncateToDecimals(price / exchangeRate, CONVERSION_PRECISION);
  }
  return price;
}

/**
 * Indica si hace falta un tipo de cambio válido para mostrar/agregar un
 * producto de otra moneda en un presupuesto.
 */
export function needsExchangeRate(
  productCurrency: string | null | undefined,
  quoteCurrency: string,
  exchangeRate: number | null | undefined
): boolean {
  return Boolean(
    productCurrency &&
      productCurrency !== quoteCurrency &&
      (!exchangeRate || exchangeRate <= 0)
  );
}

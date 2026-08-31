import { truncateMoney } from "@/lib/decimal";

export type PaymentCurrencyFields = {
  currency: string;
  exchangeRate: number | null;
  amountArs: number;
};

export const EXCHANGE_RATE_REQUIRED_MESSAGE =
  "Debe ingresar el tipo de cambio para registrar un pago en USD.";

export function isUsdDebt(debtCurrency: string | null | undefined): boolean {
  return debtCurrency === "USD";
}

function hasValidExchangeRate(
  exchangeRate: number | null | undefined
): exchangeRate is number {
  return (
    typeof exchangeRate === "number" &&
    Number.isFinite(exchangeRate) &&
    exchangeRate > 0
  );
}

/**
 * Valida que una deuda USD tenga tipo de cambio cuando se mueve dinero.
 * Devuelve un mensaje de error o `null` si la combinación es válida.
 */
export function assertPaymentExchangeRate(
  debtCurrency: string | null | undefined,
  amount: number,
  exchangeRate?: number | null
): string | null {
  if (isUsdDebt(debtCurrency) && truncateMoney(amount) > 0) {
    return hasValidExchangeRate(exchangeRate)
      ? null
      : EXCHANGE_RATE_REQUIRED_MESSAGE;
  }
  return null;
}

/**
 * Resuelve la moneda y el equivalente en ARS de un pago según la moneda de la
 * deuda. Para deudas USD el operador ingresa el monto en USD y se convierte a
 * ARS con la cotización del momento; el `amount` guardado queda en la moneda de
 * la deuda (descuenta el saldo tal cual) y `amount_ars` es su valuación
 * contable al tipo de cambio informado.
 */
export function resolvePaymentCurrencyFields(
  debtCurrency: string | null | undefined,
  amount: number,
  exchangeRate?: number | null
): PaymentCurrencyFields {
  const normalizedAmount = truncateMoney(amount);
  if (isUsdDebt(debtCurrency) && hasValidExchangeRate(exchangeRate)) {
    return {
      currency: "USD",
      exchangeRate: truncateMoney(exchangeRate),
      amountArs: truncateMoney(normalizedAmount * exchangeRate),
    };
  }

  if (isUsdDebt(debtCurrency) && normalizedAmount > 0) {
    throw new Error(EXCHANGE_RATE_REQUIRED_MESSAGE);
  }

  return {
    currency: isUsdDebt(debtCurrency) ? "USD" : "ARS",
    exchangeRate: null,
    amountArs: normalizedAmount,
  };
}

import { truncateMoney } from "@/lib/decimal";

export type PaymentCurrencyFields = {
  currency: string;
  exchangeRate: number | null;
  amountArs: number;
};

/**
 * Resuelve la moneda y el equivalente en ARS de un pago según la moneda de la
 * deuda. Para deudas USD el operador ingresa el monto en USD y se convierte a
 * ARS con la cotización del momento; el `amount` guardado queda en la moneda de
 * la deuda (descuenta el saldo tal cual) y `amount_ars` es el dinero real.
 */
export function resolvePaymentCurrencyFields(
  debtCurrency: string | null | undefined,
  amount: number,
  exchangeRate?: number | null
): PaymentCurrencyFields {
  const normalizedAmount = truncateMoney(amount);
  if (
    debtCurrency === "USD" &&
    exchangeRate &&
    Number.isFinite(exchangeRate) &&
    exchangeRate > 0
  ) {
    return {
      currency: "USD",
      exchangeRate: truncateMoney(exchangeRate),
      amountArs: truncateMoney(normalizedAmount * exchangeRate),
    };
  }
  return {
    currency: debtCurrency === "USD" ? "USD" : "ARS",
    exchangeRate: null,
    amountArs: normalizedAmount,
  };
}

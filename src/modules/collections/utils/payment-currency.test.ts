import { expect, it } from "vitest";
import { truncateMoney } from "@/lib/decimal";
import { resolvePaymentCurrencyFields } from "./payment-currency";

it("keeps the invoice quote precision so stored USD valuations reconcile", () => {
  const payment = resolvePaymentCurrencyFields("USD", 100, 1250.123_456);
  expect(payment.exchangeRate).toBe(1250.123_456);
  expect(payment.amountArs).toBe(125_012.34);
  expect(payment.amountArs).toBe(
    truncateMoney(100 * (payment.exchangeRate ?? 0))
  );
});

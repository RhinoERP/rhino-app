import { expect, it } from "vitest";
import { valueStock } from "./stock-valuation";

it("converts native ARS and USD costs exactly once with the same commercial rate", () => {
  expect(valueStock(100_000, 200, 1250)).toEqual({ ars: 350_000, usd: 280 });
});
it("does not publish a mixed-currency total without a valid quote", () => {
  expect(valueStock(100_000, 200, null)).toEqual({ ars: null, usd: null });
  expect(valueStock(100_000, 200, 0)).toEqual({ ars: null, usd: null });
  expect(valueStock(100_000, 200, Number.NaN)).toEqual({
    ars: null,
    usd: null,
  });
});
it("retains known native values when conversion is unavailable", () => {
  expect(valueStock(100_000, 0, null)).toEqual({ ars: 100_000, usd: null });
  expect(valueStock(0, 200, null)).toEqual({ ars: null, usd: 200 });
});

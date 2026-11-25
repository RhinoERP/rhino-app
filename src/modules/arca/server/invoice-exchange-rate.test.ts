import { beforeEach, expect, it, vi } from "vitest";

const { quote } = vi.hoisted(() => ({ quote: vi.fn() }));
vi.mock("@/lib/usd-quote", () => ({ fetchSuggestedUsdQuote: quote }));

import { buildArcaCurrencyRequestFields } from "../fiscal-currency";
import { resolveInvoiceExchangeRate } from "./invoice-exchange-rate";

beforeEach(() => {
  vi.clearAllMocks();
  quote.mockResolvedValue({ venta: 1250 });
});
it("sends the user-confirmed fiscal quote without replacing it with a live API quote", async () => {
  const fiscal = await resolveInvoiceExchangeRate("USD", 1234.123_456);
  expect(buildArcaCurrencyRequestFields(fiscal)).toMatchObject({
    MonId: "DOL",
    MonCotiz: 1234.123_456,
  });
  expect(quote).not.toHaveBeenCalled();
});
it("uses BNA for automated emission when no manual quote is supplied", async () => {
  expect((await resolveInvoiceExchangeRate("USD")).rate).toBe(1250);
});
it.each([
  0,
  -1,
  Number.NaN,
  Number.POSITIVE_INFINITY,
])("rejects invalid submitted rates (%s)", async (rate) => {
  await expect(resolveInvoiceExchangeRate("USD", rate)).rejects.toThrow(
    "cotización fiscal"
  );
  expect(quote).not.toHaveBeenCalled();
});
it("does not consult USD quotes for an ARS invoice", async () => {
  expect((await resolveInvoiceExchangeRate("ARS")).rate).toBe(1);
  expect(quote).not.toHaveBeenCalled();
});

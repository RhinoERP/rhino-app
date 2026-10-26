import { describe, expect, it } from "vitest";
import {
  formatCommercialExchangeRate,
  requireCommercialExchangeRateForUsdInvoice,
} from "./commercial-exchange-rate";

const COMMERCIAL_RATE_ERROR = /tipo de cambio comercial/;

describe("commercial exchange rate on USD invoices", () => {
  it("requires a positive commercial quote before USD emission", () => {
    expect(() =>
      requireCommercialExchangeRateForUsdInvoice("USD", null)
    ).toThrow(COMMERCIAL_RATE_ERROR);
    expect(() => requireCommercialExchangeRateForUsdInvoice("USD", 0)).toThrow(
      COMMERCIAL_RATE_ERROR
    );
    expect(() =>
      requireCommercialExchangeRateForUsdInvoice("USD", 1535)
    ).not.toThrow();
    expect(() =>
      requireCommercialExchangeRateForUsdInvoice("ARS", null)
    ).not.toThrow();
  });

  it("prints only the commercial quote and never invents one from the fiscal rate", () => {
    expect(formatCommercialExchangeRate("USD", 1535)).toBe(
      "1 USD = ARS 1.535,00"
    );
    expect(formatCommercialExchangeRate("USD", null)).toBe("no disponible");
    expect(formatCommercialExchangeRate("ARS", null)).toBeNull();
  });
});

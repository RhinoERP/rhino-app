import { describe, expect, it } from "vitest";
import { getMeliAccountingFiscalCurrency } from "./accounting-fiscal-currency";

describe("Meli accounting fiscal currency", () => {
  it("uses the authorized invoice rate, not a live or mock quote", () => {
    expect(
      getMeliAccountingFiscalCurrency("USD", {
        fiscalCurrency: { code: "DOL", rate: 1325.75 },
      })
    ).toEqual({ currency: "USD", exchangeRate: 1325.75 });
    expect(
      getMeliAccountingFiscalCurrency("USD", {
        wsfeRequest: { MonId: "DOL", MonCotiz: 1450 },
      })
    ).toEqual({ currency: "USD", exchangeRate: 1450 });
  });

  it("rejects missing and invalid USD fiscal data", () => {
    expect(() => getMeliAccountingFiscalCurrency("USD", null)).toThrow(
      "moneda fiscal"
    );
    expect(() => getMeliAccountingFiscalCurrency("ARS", null)).toThrow(
      "moneda fiscal"
    );
    expect(() =>
      getMeliAccountingFiscalCurrency("USD", {
        fiscalCurrency: { code: "DOL", rate: 0 },
      })
    ).toThrow("cotización fiscal autorizada");
  });

  it("rejects a fiscal currency different from the sale", () => {
    expect(() =>
      getMeliAccountingFiscalCurrency("ARS", {
        fiscalCurrency: { code: "DOL", rate: 1325 },
      })
    ).toThrow("moneda fiscal");
  });

  it("rejects conflicting currency and exchange rates in the authorized snapshot", () => {
    expect(() =>
      getMeliAccountingFiscalCurrency("USD", {
        fiscalCurrency: { code: "DOL", rate: 1000 },
        wsfeRequest: { MonId: "PES", MonCotiz: 1000 },
      })
    ).toThrow("monedas");
    expect(() =>
      getMeliAccountingFiscalCurrency("USD", {
        fiscalCurrency: { code: "DOL", rate: 1000 },
        wsfeRequest: { MonId: "DOL", MonCotiz: 1001 },
      })
    ).toThrow("cotizaciones");
  });

  it("rejects invalid explicit rates rather than silently using a fallback", () => {
    expect(() =>
      getMeliAccountingFiscalCurrency("USD", {
        fiscalCurrency: { code: "DOL", rate: 0 },
        wsfeRequest: { MonId: "DOL", MonCotiz: 1000 },
      })
    ).toThrow("cotización");
    expect(() =>
      getMeliAccountingFiscalCurrency("ARS", {
        wsfeRequest: { MonId: "PES", MonCotiz: 2 },
      })
    ).toThrow("cotización");
    expect(
      getMeliAccountingFiscalCurrency("USD", {
        fiscalCurrency: { code: "DOL", rate: "1000" },
        wsfeRequest: { MonId: "DOL", MonCotiz: 1000 },
      })
    ).toEqual({ currency: "USD", exchangeRate: 1000 });
  });
});

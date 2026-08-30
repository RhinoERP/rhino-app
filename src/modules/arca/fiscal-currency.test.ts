import { describe, expect, it } from "vitest";
import {
  buildInvoiceFiscalCurrency,
  findArcaCurrencyRate,
  readAuthorizedFiscalCurrency,
} from "./fiscal-currency";

const MISSING_AUTHORIZED_RATE_ERROR = /cotización fiscal autorizada/;

describe("fiscal currency", () => {
  it("keeps ARS invoices on PES with rate 1", () => {
    expect(buildInvoiceFiscalCurrency("ARS")).toEqual({
      code: "PES",
      rate: 1,
      sameCurrencySettlement: false,
    });
  });

  it("requests automatic ARCA quote for USD invoices", () => {
    expect(buildInvoiceFiscalCurrency("USD")).toEqual({
      code: "DOL",
      rate: null,
      sameCurrencySettlement: true,
    });
  });

  it("uses the authorized snapshot rather than a commercial quote", () => {
    expect(
      readAuthorizedFiscalCurrency({
        fiscalCurrency: {
          code: "DOL",
          rate: 1234.56,
          sameCurrencySettlement: true,
        },
        wsfeRequest: { MonCotiz: 900 },
      })
    ).toEqual({
      code: "DOL",
      rate: 1234.56,
      sameCurrencySettlement: true,
    });
  });

  it("finds the quote in a nested ARCA voucher response", () => {
    expect(
      findArcaCurrencyRate({ result: { voucher: { MonCotiz: 1234.56 } } })
    ).toBe(1234.56);
  });

  it("accepts ARCA quote values serialized as strings", () => {
    expect(findArcaCurrencyRate({ MonCotiz: "1234.56" })).toBe(1234.56);
  });

  it("blocks follow-up fiscal documents until a USD voucher is enriched", () => {
    expect(() =>
      readAuthorizedFiscalCurrency({
        wsfeRequest: { MonId: "DOL", CanMisMonExt: "S" },
      })
    ).toThrow(MISSING_AUTHORIZED_RATE_ERROR);
  });
});

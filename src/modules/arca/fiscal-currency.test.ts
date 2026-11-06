import { describe, expect, it } from "vitest";
import {
  buildArcaCurrencyRequestFields,
  buildInvoiceFiscalCurrency,
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

  it("marks USD invoices as DOL with same-currency settlement", () => {
    expect(buildInvoiceFiscalCurrency("USD")).toEqual({
      code: "DOL",
      rate: null,
      sameCurrencySettlement: true,
    });
  });

  it("serializa la cotización USD obligatoria en el request WSFE", () => {
    expect(
      buildArcaCurrencyRequestFields({
        code: "DOL",
        rate: 1234.56,
        sameCurrencySettlement: true,
      })
    ).toEqual({
      MonId: "DOL",
      MonCotiz: 1234.56,
      CanMisMonExt: "S",
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

  it("blocks follow-up fiscal documents until a USD voucher is enriched", () => {
    expect(() =>
      readAuthorizedFiscalCurrency({
        wsfeRequest: { MonId: "DOL", CanMisMonExt: "S" },
      })
    ).toThrow(MISSING_AUTHORIZED_RATE_ERROR);
  });
});

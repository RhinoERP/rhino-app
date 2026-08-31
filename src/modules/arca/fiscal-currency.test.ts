import { describe, expect, it, vi } from "vitest";
import {
  buildArcaCurrencyRequestFields,
  buildInvoiceFiscalCurrency,
  findArcaCurrencyRate,
  readAuthorizedFiscalCurrency,
  resolveArcaFiscalCurrency,
} from "./fiscal-currency";

const MISSING_AUTHORIZED_RATE_ERROR = /cotización fiscal autorizada/;
const INVALID_ARCA_RATE_ERROR = /cotización fiscal válida/;

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

  it("obtiene y valida la cotización fiscal ARCA para USD", async () => {
    const executeRequest = vi.fn().mockResolvedValue({
      MonId: "DOL",
      MonCotiz: "1234.56",
    });

    await expect(
      resolveArcaFiscalCurrency(
        { ElectronicBilling: { executeRequest } },
        buildInvoiceFiscalCurrency("USD")
      )
    ).resolves.toEqual({
      code: "DOL",
      rate: 1234.56,
      sameCurrencySettlement: true,
    });
    expect(executeRequest).toHaveBeenCalledWith("FEParamGetCotizacion", {
      MonId: "DOL",
    });
  });

  it("rechaza una cotización ARCA USD ausente o inválida", async () => {
    await expect(
      resolveArcaFiscalCurrency(
        {
          ElectronicBilling: {
            executeRequest: vi.fn().mockResolvedValue({ MonCotiz: 0 }),
          },
        },
        buildInvoiceFiscalCurrency("USD")
      )
    ).rejects.toThrow(INVALID_ARCA_RATE_ERROR);
  });

  it("preserva la cotización fija de ARS sin consultar ARCA", async () => {
    const executeRequest = vi.fn();

    await expect(
      resolveArcaFiscalCurrency(
        { ElectronicBilling: { executeRequest } },
        buildInvoiceFiscalCurrency("ARS")
      )
    ).resolves.toEqual({
      code: "PES",
      rate: 1,
      sameCurrencySettlement: false,
    });
    expect(executeRequest).not.toHaveBeenCalled();
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

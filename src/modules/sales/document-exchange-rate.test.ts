import { describe, expect, it } from "vitest";
import {
  isPositiveExchangeRate,
  readFiscalInvoiceRate,
  readSaleDocumentRate,
} from "./document-exchange-rate";

describe("document exchange rate", () => {
  it("accepts only finite positive rates", () => {
    expect(isPositiveExchangeRate(1250)).toBe(true);
    expect(isPositiveExchangeRate("1250")).toBe(false);
    expect(isPositiveExchangeRate(0)).toBe(false);
    expect(isPositiveExchangeRate(-1)).toBe(false);
    expect(isPositiveExchangeRate(Number.NaN)).toBe(false);
    expect(isPositiveExchangeRate(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("reads the authorized fiscal snapshot before the stored fallback", () => {
    expect(
      readFiscalInvoiceRate(
        {
          fiscalCurrency: { code: "DOL", rate: 1234.56 },
          wsfeRequest: { MonCotiz: 900 },
        },
        1200
      )
    ).toBe(1234.56);
    expect(readFiscalInvoiceRate({}, 1200)).toBe(1200);
    expect(readFiscalInvoiceRate({}, 0)).toBeNull();
  });

  it("uses the fiscal rate for an ARCA-authorized sale", () => {
    expect(
      readSaleDocumentRate({
        arca_status: "authorized",
        exchange_rate: 1200,
        commercial_exchange_rate: 1000,
        arca_request_json: { fiscalCurrency: { code: "DOL", rate: 1250 } },
      })
    ).toBe(1250);
  });

  it("uses the fiscal rate for an externally registered invoice", () => {
    expect(
      readSaleDocumentRate({
        arca_status: "not_requested",
        invoice_type: "FACTURA_A",
        invoice_number: "0001-00000001",
        exchange_rate: 1300,
        commercial_exchange_rate: 1000,
      })
    ).toBe(1300);
  });

  it("uses the creation-time commercial rate for an uninvoiced sale", () => {
    expect(
      readSaleDocumentRate({
        arca_status: "not_requested",
        invoice_type: "NOTA_DE_VENTA",
        invoice_number: null,
        exchange_rate: null,
        commercial_exchange_rate: 1200,
        commercial_snapshot: { exchangeRate: 1100 },
      })
    ).toBe(1200);
  });

  it("falls back to the commercial snapshot for older uninvoiced sales", () => {
    expect(
      readSaleDocumentRate({
        arca_status: "not_requested",
        invoice_type: "NOTA_DE_VENTA",
        invoice_number: null,
        exchange_rate: null,
        commercial_exchange_rate: null,
        commercial_snapshot: { exchangeRate: 1100 },
      })
    ).toBe(1100);
  });

  it("returns null when no valid document rate exists", () => {
    expect(readSaleDocumentRate(null)).toBeNull();
    expect(
      readSaleDocumentRate({
        arca_status: "not_requested",
        invoice_type: "NOTA_DE_VENTA",
        invoice_number: null,
        exchange_rate: null,
        commercial_exchange_rate: null,
        commercial_snapshot: { exchangeRate: 0 },
      })
    ).toBeNull();
  });
});

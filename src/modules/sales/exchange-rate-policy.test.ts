import { describe, expect, it } from "vitest";
import {
  assertSaleRateUpdate,
  type SaleRateState,
} from "./exchange-rate-policy";

const COMMERCIAL_RATE_FROZEN = /cotización comercial/i;
const FISCAL_RATE_LOCKED = /factura registrada o en emisión/i;
const POSITIVE_FISCAL_RATE_REQUIRED = /cotización fiscal mayor a cero/i;

const base: SaleRateState = {
  currency: "USD",
  arcaStatus: "not_requested",
  invoiceType: "NOTA_DE_VENTA",
  invoiceNumber: null,
  exchangeRate: null,
  commercialExchangeRate: 1200,
};

describe("assertSaleRateUpdate", () => {
  it("allows setting the commercial rate while it is still null", () => {
    expect(() =>
      assertSaleRateUpdate(
        { ...base, commercialExchangeRate: null },
        { commercialExchangeRate: 1250 }
      )
    ).not.toThrow();
  });

  it("allows keeping the commercial rate unchanged", () => {
    expect(() =>
      assertSaleRateUpdate(base, { commercialExchangeRate: 1200 })
    ).not.toThrow();
  });

  it("blocks changing a commercial rate already agreed in the sale", () => {
    expect(() =>
      assertSaleRateUpdate(base, { commercialExchangeRate: 1300 })
    ).toThrow(COMMERCIAL_RATE_FROZEN);
  });

  it("allows a fiscal rate while the invoice is not registered or in flight", () => {
    expect(() =>
      assertSaleRateUpdate(base, { fiscalExchangeRate: 1250 })
    ).not.toThrow();
  });

  it("blocks changing the fiscal rate of a pending invoice", () => {
    expect(() =>
      assertSaleRateUpdate(
        { ...base, arcaStatus: "pending", exchangeRate: 1250 },
        { fiscalExchangeRate: 1300 }
      )
    ).toThrow(FISCAL_RATE_LOCKED);
  });

  it("blocks changing the fiscal rate of an authorized invoice", () => {
    expect(() =>
      assertSaleRateUpdate(
        { ...base, arcaStatus: "authorized", exchangeRate: 1250 },
        { fiscalExchangeRate: 1300 }
      )
    ).toThrow(FISCAL_RATE_LOCKED);
  });

  it("blocks changing the fiscal rate of an external invoice", () => {
    expect(() =>
      assertSaleRateUpdate(
        {
          ...base,
          invoiceType: "FACTURA_A",
          invoiceNumber: "0001-00000001",
          exchangeRate: 1250,
        },
        { fiscalExchangeRate: 1300 }
      )
    ).toThrow(FISCAL_RATE_LOCKED);
  });

  it("requires a positive fiscal rate when registering a USD invoice", () => {
    expect(() =>
      assertSaleRateUpdate(base, {
        invoiceType: "FACTURA_A",
        invoiceNumber: "0001-00000001",
      })
    ).toThrow(POSITIVE_FISCAL_RATE_REQUIRED);
  });

  it("rejects a zero fiscal rate when registering a USD invoice", () => {
    expect(() =>
      assertSaleRateUpdate(base, {
        invoiceType: "FACTURA_A",
        invoiceNumber: "0001-00000001",
        fiscalExchangeRate: 0,
      })
    ).toThrow(POSITIVE_FISCAL_RATE_REQUIRED);
  });

  it("does not require a fiscal rate for an ARS external invoice", () => {
    expect(() =>
      assertSaleRateUpdate(
        {
          ...base,
          currency: "ARS",
          invoiceType: "FACTURA_A",
          invoiceNumber: "0001-00000001",
        },
        {}
      )
    ).not.toThrow();
  });
});

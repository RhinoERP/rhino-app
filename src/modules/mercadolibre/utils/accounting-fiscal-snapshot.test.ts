import { describe, expect, it } from "vitest";
import { readMeliAccountingFiscalSnapshot } from "./accounting-fiscal-snapshot";

const request = {
  CbteFch: 20_261_121,
  PtoVta: 1,
  CbteTipo: 1,
  CbteDesde: 42,
  CbteHasta: 42,
  MonId: "PES",
  MonCotiz: 1,
  ImpTotal: 124,
  ImpTotConc: 0,
  ImpNeto: 100,
  ImpOpEx: 0,
  ImpIVA: 21,
  ImpTrib: 3,
  Iva: [{ Id: 5, Importe: 21 }],
  Tributos: [{ Id: 99, Desc: "Tributo", Importe: 3 }],
};
const source = {
  status: "authorized",
  cae: "123",
  currency: "ARS" as const,
  amount: 124,
  pointOfSale: 1,
  voucherType: 1,
  voucherNumber: 42,
  request: { wsfeRequest: request },
};

describe("Meli authorized fiscal accounting snapshot", () => {
  it("extracts exact totals, detailed taxes and the fiscal date", () => {
    expect(readMeliAccountingFiscalSnapshot(source)).toEqual({
      date: "2026-11-21",
      currency: "ARS",
      exchangeRate: 1,
      total: "124.00",
      net: "100.00",
      exempt: "0.00",
      nonTaxable: "0.00",
      vat: "21.00",
      otherTaxes: "3.00",
      vatItems: [{ id: 5, amount: "21.00" }],
      tributeItems: [{ id: 99, description: "Tributo", amount: "3.00" }],
    });
  });

  it("uses the authorized USD rate without a fallback", () => {
    expect(
      readMeliAccountingFiscalSnapshot({
        ...source,
        currency: "USD",
        request: { wsfeRequest: { ...request, MonId: "DOL", MonCotiz: 1300 } },
      }).exchangeRate
    ).toBe(1300);
    expect(() =>
      readMeliAccountingFiscalSnapshot({
        ...source,
        currency: "USD",
        request: { wsfeRequest: { ...request, MonId: "DOL", MonCotiz: 0 } },
      })
    ).toThrow("cotización");
  });

  it("rejects unauthorized and mismatched voucher identities", () => {
    expect(() =>
      readMeliAccountingFiscalSnapshot({ ...source, status: "pending" })
    ).toThrow("autorización");
    expect(() =>
      readMeliAccountingFiscalSnapshot({ ...source, cae: "" })
    ).toThrow("autorización");
    expect(() =>
      readMeliAccountingFiscalSnapshot({ ...source, voucherNumber: 43 })
    ).toThrow("no coincide");
  });

  it("rejects invalid dates, amount precision and missing tax details", () => {
    for (const patch of [
      { CbteFch: 20_260_230 },
      { ImpNeto: 100.001 },
      { ImpTotal: 125 },
      { Iva: [] },
      { Tributos: [] },
    ]) {
      expect(() =>
        readMeliAccountingFiscalSnapshot({
          ...source,
          request: { wsfeRequest: { ...request, ...patch } },
        })
      ).toThrow();
    }
  });

  it("rejects snapshots missing information instead of estimating it", () => {
    expect(() =>
      readMeliAccountingFiscalSnapshot({ ...source, request: null })
    ).toThrow("snapshot fiscal");
    expect(() =>
      readMeliAccountingFiscalSnapshot({ ...source, amount: 123 })
    ).toThrow("no cuadran");
  });
});

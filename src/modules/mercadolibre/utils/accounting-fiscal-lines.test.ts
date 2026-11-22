import { describe, expect, it } from "vitest";
import { buildMeliFiscalAccountingLines } from "./accounting-fiscal-lines";
import { readMeliAccountingFiscalSnapshot } from "./accounting-fiscal-snapshot";

const receivable = "00000000-0000-4000-8000-000000000001";
const revenue = "00000000-0000-4000-8000-000000000002";
const vat = "00000000-0000-4000-8000-000000000003";
const tribute = "00000000-0000-4000-8000-000000000004";
const accounts = { receivable, net: revenue, vat: [vat], tributes: [tribute] };
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

function snapshot(currency: "ARS" | "USD" = "ARS") {
  return readMeliAccountingFiscalSnapshot({
    status: "authorized",
    cae: "123",
    currency,
    amount: 124,
    pointOfSale: 1,
    voucherType: 1,
    voucherNumber: 42,
    request: {
      wsfeRequest: {
        ...request,
        MonId: currency === "USD" ? "DOL" : "PES",
        MonCotiz: currency === "USD" ? 1325.75 : 1,
      },
    },
  });
}

describe("Meli fiscal accounting proposal", () => {
  it("builds balanced invoice lines from authorized amounts and explicit accounts", () => {
    expect(
      buildMeliFiscalAccountingLines("invoice", snapshot(), accounts)
    ).toEqual([
      {
        key: "receivable",
        accountId: receivable,
        side: "DEBE",
        originalAmount: "124.00",
        pesosAmount: "124.00",
      },
      {
        key: "net",
        accountId: revenue,
        side: "HABER",
        originalAmount: "100.00",
        pesosAmount: "100.00",
      },
      {
        key: "vat:1",
        accountId: vat,
        side: "HABER",
        originalAmount: "21.00",
        pesosAmount: "21.00",
      },
      {
        key: "tribute:1",
        accountId: tribute,
        side: "HABER",
        originalAmount: "3.00",
        pesosAmount: "3.00",
      },
    ]);
  });

  it("reverses the sides for a credit note", () => {
    expect(
      buildMeliFiscalAccountingLines("creditNote", snapshot(), accounts).map(
        (line) => line.side
      )
    ).toEqual(["HABER", "DEBE", "DEBE", "DEBE"]);
  });

  it("uses the fiscal rate and preserves original USD values", () => {
    expect(
      buildMeliFiscalAccountingLines("invoice", snapshot("USD"), accounts).map(
        (line) => line.pesosAmount
      )
    ).toEqual(["164393.00", "132575.00", "27840.75", "3977.25"]);
  });

  it("rejects absent, invalid or misleading account assignments", () => {
    expect(() =>
      buildMeliFiscalAccountingLines("invoice", snapshot(), {
        ...accounts,
        net: undefined,
      })
    ).toThrow("Asigná");
    expect(() =>
      buildMeliFiscalAccountingLines("invoice", snapshot(), {
        ...accounts,
        net: receivable,
      })
    ).toThrow("Asigná");
    expect(() =>
      buildMeliFiscalAccountingLines("invoice", snapshot(), {
        ...accounts,
        vat: [],
      })
    ).toThrow("asignaciones");
    expect(() =>
      buildMeliFiscalAccountingLines("invoice", snapshot(), {
        ...accounts,
        net: "invalida",
      })
    ).toThrow();
  });

  it("rejects invalid rate precision and unbalanced rounding instead of inventing an adjustment", () => {
    expect(() =>
      buildMeliFiscalAccountingLines(
        "invoice",
        { ...snapshot("USD"), exchangeRate: 1.234_56 },
        accounts
      )
    ).toThrow("precisión");
    expect(() =>
      buildMeliFiscalAccountingLines(
        "invoice",
        {
          ...snapshot("USD"),
          exchangeRate: 1.5,
          total: "0.02",
          net: "0.01",
          vat: "0.01",
          otherTaxes: "0.00",
          vatItems: [{ id: 5, amount: "0.01" }],
          tributeItems: [],
        },
        { receivable, net: revenue, vat: [vat], tributes: [] }
      )
    ).toThrow("redondeo");
  });

  it("rejects changes to fiscal details and amounts beyond journal capacity", () => {
    expect(() =>
      buildMeliFiscalAccountingLines(
        "invoice",
        { ...snapshot(), vat: "20.00" },
        accounts
      )
    ).toThrow();
    expect(() =>
      buildMeliFiscalAccountingLines(
        "invoice",
        {
          ...snapshot("USD"),
          exchangeRate: 999_999,
          total: "99999999999.99",
          net: "99999999999.99",
          vat: "0.00",
          otherTaxes: "0.00",
          vatItems: [],
          tributeItems: [],
        },
        { receivable, net: revenue, vat: [], tributes: [] }
      )
    ).toThrow("precisión");
    expect(() =>
      buildMeliFiscalAccountingLines(
        "invoice",
        {
          ...snapshot("USD"),
          exchangeRate: 0.0001,
          total: "100000000000.00",
          net: "100000000000.00",
          vat: "0.00",
          otherTaxes: "0.00",
          vatItems: [],
          tributeItems: [],
        },
        { receivable, net: revenue, vat: [], tributes: [] }
      )
    ).toThrow("precisión");
  });
});

import { describe, expect, it } from "vitest";
import { readMeliAccountingFiscalSnapshot } from "./accounting-fiscal-snapshot";
import {
  assertMeliPaymentBreakdownPesos,
  buildMeliPaymentAccountingLines,
} from "./accounting-payment-lines";

const receivable = "00000000-0000-4000-8000-000000000001";
const net = "00000000-0000-4000-8000-000000000002";
const discount = "00000000-0000-4000-8000-000000000003";
const commission = "00000000-0000-4000-8000-000000000004";
const shipping = "00000000-0000-4000-8000-000000000005";
const manual = "00000000-0000-4000-8000-000000000006";
const accounts = { receivable, net, discount, commission, shipping };
const breakdown = { net: "80", discount: "5", commission: "10", shipping: "5" };

function snapshot(currency: "ARS" | "USD", rate: number) {
  return readMeliAccountingFiscalSnapshot({
    status: "authorized",
    cae: "123",
    currency,
    amount: 100,
    pointOfSale: 1,
    voucherType: 1,
    voucherNumber: 42,
    request: {
      wsfeRequest: {
        CbteFch: 20_261_121,
        PtoVta: 1,
        CbteTipo: 1,
        CbteDesde: 42,
        CbteHasta: 42,
        MonId: currency === "USD" ? "DOL" : "PES",
        MonCotiz: rate,
        ImpTotal: 100,
        ImpTotConc: 0,
        ImpNeto: 100,
        ImpOpEx: 0,
        ImpIVA: 0,
        ImpTrib: 0,
      },
    },
  });
}

describe("Meli payment accounting proposal", () => {
  it("builds four independent balanced ARS entries for 100 = 80 + 5 + 10 + 5", () => {
    const result = buildMeliPaymentAccountingLines(
      { grossAmount: "100.0000", currency: "ARS" },
      breakdown,
      snapshot("ARS", 1),
      accounts
    );
    expect(result.map((entry) => entry.key)).toEqual([
      "net",
      "discount",
      "commission",
      "shipping",
    ]);
    expect(result.map((entry) => entry.lines)).toEqual(
      [
        [net, "80.00"],
        [discount, "5.00"],
        [commission, "10.00"],
        [shipping, "5.00"],
      ].map(([accountId, amount]) => [
        {
          accountId,
          side: "DEBE",
          originalAmount: amount,
          pesosAmount: amount,
        },
        {
          accountId: receivable,
          side: "HABER",
          originalAmount: amount,
          pesosAmount: amount,
        },
      ])
    );
  });

  it("uses the invoice rate for USD and preserves original amounts", () => {
    const result = buildMeliPaymentAccountingLines(
      { grossAmount: "100", currency: "USD" },
      breakdown,
      snapshot("USD", 1325.75),
      accounts
    );
    expect(result.map((entry) => entry.lines[0].pesosAmount)).toEqual([
      "106060.00",
      "6628.75",
      "13257.50",
      "6628.75",
    ]);
    expect(result.map((entry) => entry.lines[0].originalAmount)).toEqual([
      "80.00",
      "5.00",
      "10.00",
      "5.00",
    ]);
  });

  it("inverts subtractive manual concepts and ignores zero fixed components", () => {
    const result = buildMeliPaymentAccountingLines(
      { grossAmount: "98", currency: "ARS" },
      {
        net: "100",
        discount: "0",
        commission: "0",
        shipping: "0",
        manualConcepts: [
          {
            description: "Corrección",
            accountId: manual,
            amount: "2",
            direction: "SUBTRACT",
          },
        ],
      },
      snapshot("ARS", 1),
      { receivable, net }
    );
    expect(result.map((entry) => entry.key)).toEqual(["net", "manual:1"]);
    expect(result[1].lines).toEqual([
      {
        accountId: receivable,
        side: "DEBE",
        originalAmount: "2.00",
        pesosAmount: "2.00",
      },
      {
        accountId: manual,
        side: "HABER",
        originalAmount: "2.00",
        pesosAmount: "2.00",
      },
    ]);
  });

  it("rejects unbalanced amounts, missing or conflicting accounts, and wrong currency", () => {
    expect(() =>
      buildMeliPaymentAccountingLines(
        { grossAmount: "101", currency: "ARS" },
        breakdown,
        snapshot("ARS", 1),
        accounts
      )
    ).toThrow("no coincide");
    expect(() =>
      buildMeliPaymentAccountingLines(
        { grossAmount: "100", currency: "ARS" },
        breakdown,
        snapshot("ARS", 1),
        { ...accounts, net: undefined }
      )
    ).toThrow("cuenta");
    expect(() =>
      buildMeliPaymentAccountingLines(
        { grossAmount: "100", currency: "ARS" },
        breakdown,
        snapshot("ARS", 1),
        { ...accounts, net: receivable }
      )
    ).toThrow("cuenta");
    expect(() =>
      buildMeliPaymentAccountingLines(
        { grossAmount: "100", currency: "USD" },
        breakdown,
        snapshot("ARS", 1),
        accounts
      )
    ).toThrow("moneda");
  });

  it("rejects unsupported rates and rounding differences instead of creating adjustments", () => {
    expect(() =>
      buildMeliPaymentAccountingLines(
        { grossAmount: "100", currency: "USD" },
        breakdown,
        { ...snapshot("USD", 1), exchangeRate: null },
        accounts
      )
    ).toThrow("cotización");
    expect(() =>
      buildMeliPaymentAccountingLines(
        { grossAmount: "100", currency: "USD" },
        breakdown,
        { ...snapshot("USD", 1), exchangeRate: 1.234_56 },
        accounts
      )
    ).toThrow("precisión");
    expect(() =>
      buildMeliPaymentAccountingLines(
        { grossAmount: "0.02", currency: "USD" },
        { net: "0.01", discount: "0.01", commission: "0", shipping: "0" },
        snapshot("USD", 1.5),
        accounts
      )
    ).toThrow("redondeo");
  });

  it("checks the complete breakdown before individual component publication", () => {
    const split = {
      net: "0.01",
      discount: "0.01",
      commission: "0",
      shipping: "0",
    };
    expect(() =>
      assertMeliPaymentBreakdownPesos(
        { grossAmount: "0.02", currency: "USD" },
        split,
        snapshot("USD", 1.5)
      )
    ).toThrow("redondeo");
    expect(
      assertMeliPaymentBreakdownPesos(
        { grossAmount: "0.02", currency: "USD" },
        split,
        snapshot("USD", 2)
      ).map((component) => component.key)
    ).toEqual(["net", "discount"]);
  });

  it("rejects a gross payment that rounds to zero in pesos", () => {
    expect(() =>
      buildMeliPaymentAccountingLines(
        { grossAmount: "0.01", currency: "USD" },
        {
          net: "0.01",
          discount: "0",
          commission: "0",
          shipping: "0",
        },
        snapshot("USD", 0.0001),
        accounts
      )
    ).toThrow("redondea a cero");
  });
});

import { describe, expect, it } from "vitest";
import type { CuentaItem } from "@/lib/accounting-client";
import { readMeliAccountingFiscalSnapshot } from "./accounting-fiscal-snapshot";
import { buildMeliPaymentPreview } from "./accounting-payment-preview";

const ids = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
  "00000000-0000-4000-8000-000000000004",
  "00000000-0000-4000-8000-000000000005",
  "00000000-0000-4000-8000-000000000006",
];
const codes = [
  "AR_DEUDORES_VENTAS",
  "MERCADO_PAGO",
  "DESCUENTOS_OTORGADOS",
  "COMISIONES_POR_VENTAS",
  "VIATICOS",
  null,
];
const accounts: CuentaItem[] = ids.map((id, index) => ({
  id,
  codigo: String(index),
  nombre: "Cuenta",
  account_code: codes[index],
  tipo: "ACTIVO",
  naturaleza: "DEUDORA",
  activa: true,
  permite_movimientos: true,
  padre_id: null,
  moneda: "AMBAS",
}));
const breakdown = { net: "80", discount: "5", commission: "10", shipping: "5" };
const snapshot = readMeliAccountingFiscalSnapshot({
  status: "authorized",
  cae: "123",
  currency: "USD",
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
      MonId: "DOL",
      MonCotiz: 1325.75,
      ImpTotal: 100,
      ImpTotConc: 0,
      ImpNeto: 100,
      ImpOpEx: 0,
      ImpIVA: 0,
      ImpTrib: 0,
    },
  },
});
const payment = { grossAmount: "100.00", currency: "USD" as const };

describe("Meli payment monetary preview", () => {
  it("resolves the four account pairs and uses the authorized invoice rate", () => {
    const result = buildMeliPaymentPreview(
      payment,
      breakdown,
      snapshot,
      accounts
    );
    expect(result.map((item) => item.key)).toEqual([
      "net",
      "discount",
      "commission",
      "shipping",
    ]);
    expect(result[0].lines).toEqual([
      {
        accountId: ids[1],
        side: "DEBE",
        originalAmount: "80.00",
        pesosAmount: "106060.00",
      },
      {
        accountId: ids[0],
        side: "HABER",
        originalAmount: "80.00",
        pesosAmount: "106060.00",
      },
    ]);
  });

  it("rejects unavailable, ambiguous and wrong-currency semantic accounts", () => {
    for (const invalid of [
      accounts.filter((account) => account.id !== ids[1]),
      [...accounts, { ...accounts[1], id: ids[5] }],
      accounts.map((account) =>
        account.id === ids[1] ? { ...account, moneda: "ARS" } : account
      ),
      accounts.map((account) =>
        account.id === ids[1] ? { ...account, activa: false } : account
      ),
    ]) {
      expect(() =>
        buildMeliPaymentPreview(payment, breakdown, snapshot, invalid)
      ).toThrow("MERCADO_PAGO");
    }
  });

  it("validates manually selected accounts before building lines", () => {
    const withManual = {
      ...breakdown,
      net: "78",
      manualConcepts: [
        {
          description: "Otro",
          accountId: ids[5],
          amount: "2",
          direction: "ADD",
        },
      ],
    };
    expect(
      buildMeliPaymentPreview(payment, withManual, snapshot, accounts)
    ).toHaveLength(5);
    expect(() =>
      buildMeliPaymentPreview(
        payment,
        withManual,
        snapshot,
        accounts.slice(0, 5)
      )
    ).toThrow("cuenta manual");
  });

  it("does not produce a proposal for a mismatched currency or rounding", () => {
    expect(() =>
      buildMeliPaymentPreview(
        { ...payment, currency: "ARS" },
        breakdown,
        snapshot,
        accounts
      )
    ).toThrow("moneda");
    expect(() =>
      buildMeliPaymentPreview(
        { grossAmount: "0.02", currency: "USD" },
        { net: "0.01", discount: "0.01", commission: "0", shipping: "0" },
        { ...snapshot, exchangeRate: 1.5 },
        accounts
      )
    ).toThrow("redondeo");
  });
});

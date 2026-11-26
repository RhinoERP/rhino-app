import { describe, expect, it } from "vitest";
import type { CuentaItem } from "@/lib/accounting-client";
import {
  buildMeliFiscalPreview,
  meliFiscalAccountFields,
} from "./accounting-fiscal-preview";

const receivable = "00000000-0000-4000-8000-000000000001";
const revenue = "00000000-0000-4000-8000-000000000002";
const tax = "00000000-0000-4000-8000-000000000003";
const assignments = { receivable, net: revenue, "vat:0": tax };
const snapshot = {
  date: "2026-11-23",
  currency: "USD" as const,
  exchangeRate: 1000,
  total: "121.00",
  net: "100.00",
  exempt: "0.00",
  nonTaxable: "0.00",
  vat: "21.00",
  otherTaxes: "0.00",
  vatItems: [{ id: 5, amount: "21.00" }],
  tributeItems: [],
};
function account(id: string): CuentaItem {
  return {
    id,
    codigo: id,
    nombre: id,
    account_code: null,
    tipo: "ACTIVO",
    naturaleza: "DEUDORA",
    activa: true,
    permite_movimientos: true,
    padre_id: null,
    moneda: "USD",
  };
}
const accounts = [account(receivable), account(revenue), account(tax)];

describe("Meli fiscal monetary preview", () => {
  it("uses explicit compatible accounts and the authorized USD rate for both orientations", () => {
    const invoice = buildMeliFiscalPreview(
      "invoice",
      snapshot,
      accounts,
      assignments
    );
    const creditNote = buildMeliFiscalPreview(
      "creditNote",
      snapshot,
      accounts,
      assignments
    );
    expect(invoice.map((line) => [line.side, line.pesosAmount])).toEqual([
      ["DEBE", "121000.00"],
      ["HABER", "100000.00"],
      ["HABER", "21000.00"],
    ]);
    expect(creditNote.map((line) => line.side)).toEqual([
      "HABER",
      "DEBE",
      "DEBE",
    ]);
    expect(meliFiscalAccountFields(snapshot).map((field) => field.key)).toEqual(
      ["receivable", "net", "vat:0"]
    );
  });

  it("rejects missing, inactive, non-postable, foreign and wrong-currency accounts", () => {
    for (const altered of [
      accounts.slice(0, 2),
      [accounts[0], accounts[1], { ...accounts[2], activa: false }],
      [
        accounts[0],
        accounts[1],
        { ...accounts[2], permite_movimientos: false },
      ],
      [accounts[0], accounts[1], { ...accounts[2], moneda: "ARS" }],
    ]) {
      expect(() =>
        buildMeliFiscalPreview("invoice", snapshot, altered, assignments)
      ).toThrow("cuenta disponible");
    }
    expect(() =>
      buildMeliFiscalPreview("invoice", snapshot, accounts, {
        ...assignments,
        net: receivable,
      })
    ).toThrow("Asigná");
  });

  it("supports ARS, shared-currency accounts and exempt or tribute details", () => {
    const arsSnapshot = {
      ...snapshot,
      currency: "ARS" as const,
      exchangeRate: 1,
      total: "125.00",
      exempt: "2.00",
      nonTaxable: "1.00",
      otherTaxes: "1.00",
      tributeItems: [{ id: 99, description: "Otro tributo", amount: "1.00" }],
    };
    const sharedAccounts = accounts.map((item) => ({
      ...item,
      moneda: "AMBAS",
    }));
    const lines = buildMeliFiscalPreview(
      "invoice",
      arsSnapshot,
      sharedAccounts,
      {
        ...assignments,
        exempt: revenue,
        nonTaxable: revenue,
        "tribute:0": tax,
      }
    );
    expect(
      lines.map((line) => [line.key, line.originalAmount, line.pesosAmount])
    ).toEqual([
      ["receivable", "125.00", "125.00"],
      ["net", "100.00", "100.00"],
      ["exempt", "2.00", "2.00"],
      ["nonTaxable", "1.00", "1.00"],
      ["vat:1", "21.00", "21.00"],
      ["tribute:1", "1.00", "1.00"],
    ]);
  });
});

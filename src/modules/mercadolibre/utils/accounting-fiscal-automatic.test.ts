import { describe, expect, it } from "vitest";
import {
  assertAutomaticCreditMatchesInvoice,
  fiscalAutomaticAssignments,
  fiscalAutomaticMapping,
} from "./accounting-fiscal-automatic";

const receivable = "00000000-0000-4000-8000-000000000001";
const revenue = "00000000-0000-4000-8000-000000000002";
const tax = "00000000-0000-4000-8000-000000000003";
const snapshot = {
  date: "2026-11-23",
  currency: "ARS" as const,
  exchangeRate: 1,
  total: "121.00",
  net: "100.00",
  exempt: "0.00",
  nonTaxable: "0.00",
  vat: "21.00",
  otherTaxes: "0.00",
  vatItems: [{ id: 5, amount: "21.00" }],
  tributeItems: [],
};

describe("automatic fiscal account mapping", () => {
  it("maps taxes by fiscal identity rather than line position", () => {
    const config = fiscalAutomaticMapping(snapshot, {
      receivable,
      net: revenue,
      "vat:0": tax,
    });
    expect(config).toEqual({ receivable, net: revenue, "vat:5": tax });
    expect(fiscalAutomaticAssignments(snapshot, config)).toEqual({
      receivable,
      net: revenue,
      "vat:0": tax,
    });
    expect(() =>
      fiscalAutomaticAssignments(
        { ...snapshot, vatItems: [{ id: 4, amount: "21.00" }] },
        config
      )
    ).toThrow("No hay cuenta automática");
  });

  it("rejects ambiguous repeated tax identities and unknown tribute descriptions", () => {
    const repeated = {
      ...snapshot,
      vatItems: [
        { id: 5, amount: "10.00" },
        { id: 5, amount: "11.00" },
      ],
    };
    expect(() =>
      fiscalAutomaticMapping(repeated, {
        receivable,
        net: revenue,
        "vat:0": tax,
        "vat:1": revenue,
      })
    ).toThrow("distintas cuentas");
    const withTribute = {
      ...snapshot,
      tributeItems: [{ id: 99, description: "Impuesto A", amount: "1.00" }],
    };
    const config = fiscalAutomaticMapping(withTribute, {
      receivable,
      net: revenue,
      "vat:0": tax,
      "tribute:0": tax,
    });
    expect(() =>
      fiscalAutomaticAssignments(
        {
          ...withTribute,
          tributeItems: [{ id: 99, description: "Impuesto B", amount: "1.00" }],
        },
        config
      )
    ).toThrow("No hay cuenta automática");
  });

  it("requires the original invoice accounts and tax categories for notes", () => {
    const lines = [
      {
        accountId: receivable,
        side: "DEBE" as const,
        originalAmount: "121.00",
        pesosAmount: "121.00",
      },
      {
        accountId: revenue,
        side: "HABER" as const,
        originalAmount: "100.00",
        pesosAmount: "100.00",
      },
      {
        accountId: tax,
        side: "HABER" as const,
        originalAmount: "21.00",
        pesosAmount: "21.00",
      },
    ];
    const receipt = {
      journalEntryId: receivable,
      payload: {
        orgId: receivable,
        originType: "invoice" as const,
        originId: receivable,
        componentKey: "fiscal" as const,
        requestKey: receivable,
        date: snapshot.date,
        description: "Factura",
        actorId: receivable,
        currency: "ARS" as const,
        exchangeRate: "1",
        lines: [...lines].reverse(),
      },
    };
    const partial = {
      ...snapshot,
      net: "50.00",
      vatItems: [{ id: 5, amount: "10.50" }],
    };
    expect(() =>
      assertAutomaticCreditMatchesInvoice(partial, snapshot, lines, receipt)
    ).not.toThrow();
    expect(() =>
      assertAutomaticCreditMatchesInvoice(
        { ...partial, vatItems: [{ id: 4, amount: "10.50" }] },
        snapshot,
        lines,
        receipt
      )
    ).toThrow("concepto fiscal");
    expect(() =>
      assertAutomaticCreditMatchesInvoice(partial, snapshot, lines, {
        ...receipt,
        payload: {
          ...receipt.payload,
          lines: [{ ...lines[0], accountId: tax }, ...lines.slice(1)],
        },
      })
    ).toThrow("no coinciden");
  });
});

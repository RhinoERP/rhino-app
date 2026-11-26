import { describe, expect, it } from "vitest";
import {
  assertMeliFiscalPayloadMatchesSource,
  assertMeliInvoiceReceiptMatchesFiscal,
  invoiceReceiptSchema,
} from "./accounting-invoice-receipt";

const id = "00000000-0000-4000-8000-000000000001";
const revenue = "00000000-0000-4000-8000-000000000002";
const tax = "00000000-0000-4000-8000-000000000003";
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
const receipt = invoiceReceiptSchema.parse({
  journalEntryId: id,
  payload: {
    orgId: id,
    originType: "invoice",
    originId: id,
    componentKey: "fiscal",
    requestKey: id,
    date: "2026-11-23",
    description: "Factura",
    actorId: id,
    currency: "USD",
    exchangeRate: "1000",
    lines: [
      {
        accountId: id,
        side: "DEBE",
        originalAmount: "121.00",
        pesosAmount: "121000.00",
      },
      {
        accountId: revenue,
        side: "HABER",
        originalAmount: "100.00",
        pesosAmount: "100000.00",
      },
      {
        accountId: tax,
        side: "HABER",
        originalAmount: "21.00",
        pesosAmount: "21000.00",
      },
    ],
  },
});
const source = { orgId: id, saleId: id };
const accounts = [
  { id, account_code: "AR_DEUDORES_VENTAS" },
  { id: revenue, account_code: null },
  { id: tax, account_code: null },
];
describe("invoice receipt fiscal verification", () => {
  it("verifies the fiscal monetary breakdown in either line order", () => {
    expect(() =>
      assertMeliInvoiceReceiptMatchesFiscal(receipt, source, snapshot, accounts)
    ).not.toThrow();
    expect(() =>
      assertMeliInvoiceReceiptMatchesFiscal(
        {
          ...receipt,
          payload: {
            ...receipt.payload,
            lines: [...receipt.payload.lines].reverse(),
          },
        },
        source,
        snapshot,
        accounts
      )
    ).not.toThrow();
  });
  it("rejects foreign origin, rate, amounts, orientation and missing accounts", () => {
    expect(() =>
      assertMeliInvoiceReceiptMatchesFiscal(
        receipt,
        { ...source, orgId: tax },
        snapshot,
        accounts
      )
    ).toThrow("comprobante");
    expect(() =>
      assertMeliInvoiceReceiptMatchesFiscal(
        receipt,
        source,
        { ...snapshot, exchangeRate: 999 },
        accounts
      )
    ).toThrow("cotización");
    expect(() =>
      assertMeliInvoiceReceiptMatchesFiscal(
        {
          ...receipt,
          payload: {
            ...receipt.payload,
            lines: [
              receipt.payload.lines[0],
              { ...receipt.payload.lines[1], originalAmount: "101" },
              receipt.payload.lines[2],
            ],
          },
        },
        source,
        snapshot,
        accounts
      )
    ).toThrow("líneas");
    expect(() =>
      assertMeliInvoiceReceiptMatchesFiscal(
        {
          ...receipt,
          payload: {
            ...receipt.payload,
            lines: receipt.payload.lines.map((line) => ({
              ...line,
              side: "HABER" as const,
            })),
          },
        },
        source,
        snapshot,
        accounts
      )
    ).toThrow("contrapartida");
    expect(() =>
      assertMeliInvoiceReceiptMatchesFiscal(
        receipt,
        source,
        snapshot,
        accounts.slice(0, 2)
      )
    ).toThrow("líneas");
    expect(() =>
      assertMeliInvoiceReceiptMatchesFiscal(receipt, source, snapshot, [
        { ...accounts[0], account_code: null },
        ...accounts.slice(1),
      ])
    ).toThrow("deudores");
  });

  it("verifies the reverse orientation for a credit note", () => {
    const note = {
      ...receipt.payload,
      originType: "creditNote" as const,
      lines: receipt.payload.lines.map((line) => ({
        ...line,
        side: line.side === "DEBE" ? ("HABER" as const) : ("DEBE" as const),
      })),
    };
    const noteSource = {
      orgId: id,
      originId: id,
      originType: "creditNote" as const,
    };
    expect(() =>
      assertMeliFiscalPayloadMatchesSource(note, noteSource, snapshot, accounts)
    ).not.toThrow();
    expect(() =>
      assertMeliFiscalPayloadMatchesSource(
        { ...note, lines: receipt.payload.lines },
        noteSource,
        snapshot,
        accounts
      )
    ).toThrow();
  });
});

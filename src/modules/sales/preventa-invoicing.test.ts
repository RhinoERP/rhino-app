import { describe, expect, it } from "vitest";
import {
  canIssueArcaInvoiceForPreventa,
  hasFullFiscalReversal,
  isAuthorizedPreventaInvoice,
} from "./preventa-invoicing";

describe("preventa fiscal invoicing policy", () => {
  it("only enables ARCA issuance for draft preventas when configured", () => {
    expect(canIssueArcaInvoiceForPreventa("DRAFT", true)).toBe(true);
    expect(canIssueArcaInvoiceForPreventa("DRAFT", false)).toBe(false);
    expect(canIssueArcaInvoiceForPreventa("CONFIRMED", true)).toBe(false);
  });

  it("recognizes an authorized draft-preventa invoice", () => {
    expect(isAuthorizedPreventaInvoice("DRAFT", "authorized")).toBe(true);
    expect(isAuthorizedPreventaInvoice("DRAFT", "pending")).toBe(false);
    expect(isAuthorizedPreventaInvoice("CONFIRMED", "authorized")).toBe(false);
  });

  it("requires the full fiscal total to be reversed", () => {
    expect(
      hasFullFiscalReversal({ saleTotal: 1000, authorizedCreditAmount: 999.99 })
    ).toBe(false);
    expect(
      hasFullFiscalReversal({ saleTotal: 1000, authorizedCreditAmount: 1000 })
    ).toBe(true);
  });
});

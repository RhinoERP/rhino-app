import { describe, expect, it } from "vitest";
import type { CustomerOpenReceivable } from "@/modules/collections/actions/get-customer-open-receivables.action";
import {
  openReceivablesCsv,
  summarizeOpenReceivables,
} from "./customer-open-receivables";

const account: CustomerOpenReceivable = {
  id: "one",
  invoiceNumber: '=IMPORT("x")',
  saleNumber: 1,
  saleDate: "2026-11-01",
  dueDate: "2026-11-19",
  currency: "ARS",
  totalAmount: 120,
  pendingBalance: 20,
};

describe("customer pending invoices", () => {
  it("keeps overdue and future amounts separate by currency", () => {
    expect(
      summarizeOpenReceivables(
        [
          account,
          { ...account, id: "two", dueDate: "2026-11-20", pendingBalance: 10 },
          { ...account, id: "three", currency: "USD", pendingBalance: 5 },
        ],
        "2026-11-20"
      )
    ).toEqual([
      { currency: "ARS", total: 30, overdue: 20, notOverdue: 10 },
      { currency: "USD", total: 5, overdue: 5, notOverdue: 0 },
    ]);
  });

  it("escapes spreadsheet formulas in exported invoice numbers", () => {
    expect(openReceivablesCsv([account])).toContain("'\u003dIMPORT");
  });
});

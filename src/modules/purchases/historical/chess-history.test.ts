import { describe, expect, it } from "vitest";
import {
  collectPurchaseHistoryExport,
  type PurchaseHistoryDocument,
  purchaseHistoryExportRows,
  purchaseHistoryFiltersSchema,
  purchaseHistorySearch,
} from "./chess-history";

describe("purchase history search and export", () => {
  it("refuses a partial export when the next batch is missing", async () => {
    const doc = { id: "document-1" } as PurchaseHistoryDocument;
    await expect(
      collectPurchaseHistoryExport(
        async (offset) =>
          await Promise.resolve({
            data: offset === 0 ? [doc] : [],
            totalCount: 2,
          })
      )
    ).rejects.toThrow("incompleta");
  });
  it("keeps comma, quotes and parentheses inside quoted PostgREST values", () => {
    expect(purchaseHistorySearch('Hotel "Centro", (Norte)')).toContain(
      'supplier_name.ilike."%Hotel \\"Centro\\", (Norte)%"'
    );
  });
  it("rejects invalid dates and unsupported sorting rather than sending unsafe filters", () => {
    expect(
      purchaseHistoryFiltersSchema.safeParse({ dateFrom: "2026-02-30" }).success
    ).toBe(false);
    expect(
      purchaseHistoryFiltersSchema.safeParse({
        sort: [{ id: "private_column", desc: false }],
      }).success
    ).toBe(false);
  });
  it("exports native credit amounts once and keeps MI out of net purchases", () => {
    const doc = {
      document_date: "2026-01-01",
      printed_number: "MI 0-1",
      document_code: "MI",
      supplier_chess_code: "1",
      supplier_name: "Proveedor",
      is_fiscal: false,
      is_mipyme: false,
      currency: "ARS",
      total_amount: -100,
      debt_sign: -1,
      purchase_sign: 0,
      payment_order_references: ["OP-1", "OP-2"],
    } as PurchaseHistoryDocument;
    const [row] = purchaseHistoryExportRows([doc]);
    expect(row.slice(7, 12)).toEqual([
      -100,
      -100,
      0,
      "OP-1; OP-2",
      "Sin conciliar",
    ]);
  });
});

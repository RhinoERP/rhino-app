import { describe, expect, it, vi } from "vitest";
import { resolveOrderAuthorizedInvoiceNumber } from "./order-remittance-invoice.service";

function createSupabaseStub(params: {
  parentSaleId?: string | null;
  arcaStatus?: string | null;
  invoiceNumber?: string | null;
}) {
  return {
    from: vi.fn((table: string) => {
      const result = {
        data:
          table === "orders"
            ? { sales_order_id: params.parentSaleId ?? null }
            : {
                arca_status: params.arcaStatus ?? null,
                invoice_number: params.invoiceNumber ?? null,
              },
        error: null,
      };
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        single: vi.fn().mockResolvedValue(result),
        maybeSingle: vi.fn().mockResolvedValue(result),
      };
      return query;
    }),
  } as unknown as Parameters<typeof resolveOrderAuthorizedInvoiceNumber>[0];
}

describe("resolveOrderAuthorizedInvoiceNumber", () => {
  it("uses the parent order sale and returns its authorized invoice", async () => {
    const supabase = createSupabaseStub({
      parentSaleId: "sale-parent",
      arcaStatus: "authorized",
      invoiceNumber: "0001-00000042",
    });

    await expect(
      resolveOrderAuthorizedInvoiceNumber(supabase, "org", {
        sales_order_id: null,
        parent_order_id: "order-parent",
      })
    ).resolves.toBe("0001-00000042");

    expect(supabase.from).toHaveBeenNthCalledWith(1, "orders");
    expect(supabase.from).toHaveBeenNthCalledWith(2, "sales_orders");
  });

  it("does not return a manual number when the linked sale is not authorized", async () => {
    const supabase = createSupabaseStub({
      arcaStatus: "pending",
      invoiceNumber: "MANUAL-42",
    });

    await expect(
      resolveOrderAuthorizedInvoiceNumber(supabase, "org", {
        sales_order_id: "sale-direct",
        parent_order_id: null,
      })
    ).resolves.toBeUndefined();
  });
});

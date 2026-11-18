import { beforeEach, describe, expect, it, vi } from "vitest";
import { bulkConfirmSalesAction } from "./bulk-confirm-sales.action";

const mocks = vi.hoisted(() => ({ sales: vi.fn(), confirm: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/modules/organizations/utils/with-permission-guard", () => ({
  ensure: vi.fn(),
}));
vi.mock("../service/sales.service", () => ({
  confirmSaleOrder: mocks.confirm,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => {
      const query = { select: () => query, in: () => query, eq: mocks.sales };
      return query;
    },
  }),
}));

const sale = {
  id: "sale",
  sale_number: 1,
  customer_id: "customer",
  user_id: "seller",
  sale_date: "2026-11-15",
  expiration_date: null,
  credit_days: 0,
  invoice_type: "FACTURA_A",
  invoice_number: null,
  observations: null,
  global_discount_percentage: 0,
  sales_order_items: [],
};

describe("bulk wholesale confirmation after nullable customer migration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.confirm.mockResolvedValue({ saleId: sale.id });
  });

  it("keeps passing a registered buyer to the existing wholesale service", async () => {
    mocks.sales.mockResolvedValue({ data: [sale], error: null });
    const result = await bulkConfirmSalesAction("org", [sale.id]);
    expect(result.results[0].ok).toBe(true);
    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: "customer", saleId: "sale" })
    );
  });

  it("does not confirm a buyer-snapshot sale through the wholesale path", async () => {
    mocks.sales.mockResolvedValue({
      data: [{ ...sale, customer_id: null }],
      error: null,
    });
    const result = await bulkConfirmSalesAction("org", [sale.id]);
    expect(result.results[0]).toMatchObject({
      ok: false,
      error: "La confirmación mayorista requiere un cliente registrado.",
    });
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
});

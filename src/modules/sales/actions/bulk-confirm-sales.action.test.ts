import { beforeEach, describe, expect, it, vi } from "vitest";
import { bulkConfirmSalesAction } from "./bulk-confirm-sales.action";

const mocks = vi.hoisted(() => ({ client: vi.fn(), confirm: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/modules/organizations/utils/with-permission-guard", () => ({
  ensure: vi.fn(),
}));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: async () => ({ id: "org" }),
}));
vi.mock("../service/sales.service", () => ({
  confirmSaleOrder: mocks.confirm,
}));

function sale(customerId: string | null, organizationId = "org") {
  return {
    id: `sale-${organizationId}`,
    organization_id: organizationId,
    sale_number: 1,
    customer_id: customerId,
    user_id: "seller",
    sale_date: "2026-11-20",
    invoice_type: "FACTURA_A",
    sales_order_items: [],
  };
}

function installClient(rows: ReturnType<typeof sale>[]) {
  mocks.client.mockResolvedValue({
    from: () => {
      const filters = new Map<string, unknown>();
      const result = Promise.resolve().then(() => ({
        data: rows.filter(
          (row) =>
            !filters.has("organization_id") ||
            row.organization_id === filters.get("organization_id")
        ),
        error: null,
      }));
      const query = Object.assign(result, {
        select: vi.fn(),
        in: vi.fn(),
        eq: vi.fn(),
      });
      query.select.mockReturnValue(query);
      query.in.mockReturnValue(query);
      query.eq.mockImplementation((column: string, value: unknown) => {
        filters.set(column, value);
        return query;
      });
      return query;
    },
  });
}

describe("bulkConfirmSalesAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.confirm.mockResolvedValue(undefined);
  });

  it("does not confirm or expose another organization's sale in a mixed selection", async () => {
    installClient([sale("customer"), sale("foreign-customer", "other-org")]);
    const result = await bulkConfirmSalesAction("org", [
      "sale-org",
      "sale-other-org",
    ]);
    expect(result.success).toBe(true);
    expect(result.results.map((row) => row.saleId)).toEqual(["sale-org"]);
    expect(mocks.confirm).toHaveBeenCalledTimes(1);
    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        saleId: "sale-org",
        customerId: "customer",
        invoiceType: "FACTURA_A",
      })
    );
  });

  it("rejects a customerless sale before any confirmation or stock change", async () => {
    installClient([sale(null)]);
    const result = await bulkConfirmSalesAction("org", ["sale-org"]);
    expect(result.results).toEqual([
      expect.objectContaining({
        ok: false,
        error: "La venta no tiene un cliente asociado.",
      }),
    ]);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
});

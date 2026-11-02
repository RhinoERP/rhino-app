import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAllStockForExport,
  getStockMetrics,
  getStockPaginated,
} from "./inventory.service";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  access: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: mocks.from, rpc: mocks.rpc }),
}));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: async () => ({ id: "org" }),
}));
vi.mock("./warehouse-stock.service", () => ({
  assertWarehouseAccess: mocks.access,
}));

const metrics = {
  warehouseScoped: false,
  canViewCosts: true,
  totalProducts: 3000,
  activeProducts: 2500,
  inactiveProducts: 500,
  totalUnits: 12_000,
  totalKg: 15,
  totalLt: 6,
  totalStockValue: 100,
  lowStockCount: 1,
};

function setupCatalogue(count: number) {
  const products = Array.from({ length: count }, (_, index) => ({
    id: `product-${index}`,
    sku: `SKU-${index}`,
    name: `Product ${index}`,
    unit_of_measure: "UNIT",
    has_variants: false,
    tracks_stock_units: false,
  }));
  const select = vi.fn().mockReturnThis();
  const ranges = vi.fn(
    (
      from: number,
      to: number
    ): Promise<{
      data: Record<string, unknown>[];
      error: { message: string } | null;
      count: number;
    }> =>
      Promise.resolve({
        data: products.slice(from, to + 1).map((product) => ({
          product_id: product.id,
          sku: product.sku,
          product_name: product.name,
          is_active: true,
        })),
        error: null,
        count,
      })
  );
  mocks.from.mockImplementation((table: string) => {
    if (table === "view_stock_detail") {
      return {
        select,
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: ranges,
      };
    }
    if (table === "products") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn((_column: string, ids: string[]) =>
          Promise.resolve({
            data: products.filter((product) => ids.includes(product.id)),
            error: null,
          })
        ),
      };
    }
    throw new Error(`Unexpected full-table read: ${table}`);
  });
  mocks.rpc.mockImplementation((_name, args) =>
    Promise.resolve({
      data: args.p_product_ids.map((id: string) => ({
        product_id: id,
        quantity_available: 40,
        unit_quantity_available: 0,
      })),
      error: null,
    })
  );
  return { select, ranges };
}

describe("optimized stock read boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.access.mockResolvedValue({});
  });

  it("loads balances only for the current page and never requests the view's calculated stock", async () => {
    const { select } = setupCatalogue(1000);
    const result = await getStockPaginated("org", { page: 2, pageSize: 20 });
    expect(result.data).toHaveLength(20);
    expect(result.data.every((item) => item.total_stock === 40)).toBe(true);
    expect(result.totalCount).toBe(1000);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc.mock.calls[0][1].p_product_ids).toEqual(
      Array.from({ length: 20 }, (_, index) => `product-${index + 20}`)
    );
    expect(
      select.mock.calls[0][0].split(",").map((column: string) => column.trim())
    ).not.toContain("total_stock");
    expect(select.mock.calls[0][0]).not.toBe("*");
    expect(mocks.from.mock.calls.map((call) => call[0])).not.toContain(
      "product_lots"
    );
  });

  it("exports all result pages with bounded aggregate calls and no individual lots", async () => {
    const { select, ranges } = setupCatalogue(1001);
    const result = await getAllStockForExport("org", {
      warehouseId: "warehouse",
    });
    expect(result).toHaveLength(1001);
    expect(ranges).toHaveBeenCalledWith(1000, 1999);
    expect(
      mocks.rpc.mock.calls.map((call) => call[1].p_product_ids.length)
    ).toEqual([500, 500, 1]);
    expect(
      mocks.rpc.mock.calls.every(
        (call) => call[1].p_warehouse_id === "warehouse"
      )
    ).toBe(true);
    expect(select.mock.calls[0][0]).not.toContain("total_stock");
  });

  it("fetches global metrics in a single RPC without catalogue, lots, prices or export queries", async () => {
    mocks.rpc.mockResolvedValue({ data: metrics, error: null });
    expect(await getStockMetrics("org")).toEqual(metrics);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(
      "get_inventory_stock_metrics",
      { p_org_id: "org" }
    );
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("scopes metrics solely by organization and warehouse, independently of table filters", async () => {
    mocks.rpc.mockResolvedValue({
      data: { ...metrics, warehouseScoped: true },
      error: null,
    });
    expect((await getStockMetrics("org", "warehouse")).warehouseScoped).toBe(
      true
    );
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(
      "get_inventory_stock_metrics",
      { p_org_id: "org", p_warehouse_id: "warehouse" }
    );
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("does not turn a catalogue timeout into an empty inventory", async () => {
    const { ranges } = setupCatalogue(1);
    ranges.mockResolvedValue({
      data: [],
      count: 0,
      error: { message: "statement timeout" },
    });
    await expect(
      getStockPaginated("org", { page: 1, pageSize: 20 })
    ).rejects.toThrow("statement timeout");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

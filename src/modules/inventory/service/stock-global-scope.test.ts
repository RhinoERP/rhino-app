import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAllStockForExport,
  getStockMetrics,
  getStockPaginated,
} from "./inventory.service";

const mocks = vi.hoisted(() => ({ from: vi.fn(), access: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: mocks.from }),
}));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: async () => ({ id: "org" }),
}));
vi.mock("./warehouse-stock.service", () => ({
  assertWarehouseAccess: mocks.access,
}));

type Product = {
  id: string;
  unit_of_measure: "UNIT" | "KG" | "LT";
  is_active: boolean;
  has_variants: boolean;
  cost_price: number;
};
type Lot = {
  id: string;
  product_id: string;
  warehouse_id: string;
  quantity_available: number;
  unit_quantity_available: number | null;
  variant: { is_active: boolean } | null;
};

function setup(products: Product[], lots: Lot[]) {
  const ranges = vi.fn();
  mocks.from.mockImplementation((table: string) => {
    let warehouse: string | undefined;
    let ids: string[] = [];
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn((column: string, value: string) => {
        if (column === "warehouse_id") {
          warehouse = value;
        }
        return builder;
      }),
      order: vi.fn().mockReturnThis(),
      in: vi.fn((_column: string, values: string[]) => {
        ids = values;
        if (table === "products" || table === "products_with_price") {
          return Promise.resolve({
            data: products.filter((entry) => ids.includes(entry.id)),
            error: null,
          });
        }
        return builder;
      }),
      range: vi.fn((from: number, to: number) => {
        ranges(table, warehouse, from, to);
        const data =
          table === "view_stock_detail"
            ? products.map((entry) => ({
                product_id: entry.id,
                sku: entry.id,
                product_name: entry.id,
                total_stock: 999,
                is_active: entry.is_active,
              }))
            : lots.filter(
                (entry) =>
                  ids.includes(entry.product_id) &&
                  (!warehouse || entry.warehouse_id === warehouse)
              );
        return Promise.resolve({
          data: data.slice(from, to + 1),
          count: data.length,
          error: null,
        });
      }),
    };
    return builder;
  });
  return ranges;
}

function product(
  id: string,
  overrides: Partial<Omit<Product, "id">> = {}
): Product {
  return {
    id,
    unit_of_measure: "UNIT",
    has_variants: false,
    is_active: true,
    cost_price: 2,
    ...overrides,
  };
}

function lot(
  id: string,
  quantity: number,
  warehouse = "source",
  variant: Lot["variant"] = null
): Lot {
  return {
    id: `${warehouse}-${id}`,
    product_id: id,
    warehouse_id: warehouse,
    quantity_available: quantity,
    unit_quantity_available: 1,
    variant,
  };
}

describe("global and warehouse stock reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue({});
  });

  it("uses the same lot balances in the table, export and KPIs, excluding inactive products and variants from KPI totals", async () => {
    const products = [
      product("simple"),
      product("variant", { has_variants: true, cost_price: 3 }),
      product("inactive", {
        has_variants: true,
        is_active: false,
        cost_price: 100,
      }),
      product("kg", { unit_of_measure: "KG", cost_price: 10 }),
      product("lt", { unit_of_measure: "LT", cost_price: 5 }),
      product("empty"),
    ];
    setup(products, [
      lot("simple", 40),
      lot("simple", 10, "destination"),
      lot("variant", 6, "source", { is_active: true }),
      lot("variant", 4, "destination", { is_active: true }),
      {
        ...lot("variant", 1000, "source", { is_active: false }),
        id: "inactive-variant",
      },
      lot("inactive", 13, "source", { is_active: true }),
      lot("inactive", 7, "destination", { is_active: true }),
      lot("kg", 2),
      lot("kg", 3, "destination"),
      lot("lt", 4),
      lot("lt", 6, "destination"),
    ]);
    const global = await getStockMetrics("org");
    const source = await getStockMetrics("org", "source");
    const destination = await getStockMetrics("org", "destination");
    for (const metric of [
      "totalUnits",
      "totalKg",
      "totalLt",
      "totalStockValue",
    ] as const) {
      expect(global[metric]).toBe(source[metric] + destination[metric]);
    }
    expect(global).toMatchObject({
      totalUnits: 60,
      totalKg: 5,
      totalLt: 10,
      totalStockValue: 230,
      activeProducts: 5,
    });
    expect(source.activeProducts).toBe(4);
    const table = await getStockPaginated("org", { page: 1, pageSize: 20 });
    const exported = await getAllStockForExport("org");
    expect(table.data.map((item) => item.total_stock)).toEqual([
      50, 10, 20, 5, 10, 0,
    ]);
    expect(exported.map((item) => item.total_stock)).toEqual(
      table.data.map((item) => item.total_stock)
    );
  });

  it("reads more than 1000 lots across warehouses instead of truncating global totals", async () => {
    const lots = Array.from({ length: 1200 }, (_, index) => ({
      ...lot("simple", 1, index < 600 ? "source" : "destination"),
      id: `lot-${index}`,
    }));
    const ranges = setup([product("simple")], lots);
    expect((await getStockMetrics("org")).totalUnits).toBe(1200);
    expect((await getStockMetrics("org", "source")).totalUnits).toBe(600);
    expect((await getStockMetrics("org", "destination")).totalUnits).toBe(600);
    expect(ranges).toHaveBeenCalledWith("product_lots", undefined, 1000, 1999);
  });

  it("paginates catalogue metadata and costs beyond 1000 products", async () => {
    const products = Array.from({ length: 1001 }, (_, index) =>
      product(`product-${index}`)
    );
    const ranges = setup(
      products,
      products.map((entry) => lot(entry.id, 1))
    );
    const metrics = await getStockMetrics("org");
    expect(metrics).toMatchObject({
      totalProducts: 1001,
      activeProducts: 1001,
      totalUnits: 1001,
      totalStockValue: 2002,
    });
    expect(ranges).toHaveBeenCalledWith(
      "view_stock_detail",
      undefined,
      1000,
      1999
    );
  });
});

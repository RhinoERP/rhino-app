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

function query() {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    range: vi.fn(),
  };
}

const rows = [
  {
    product_id: "simple",
    sku: "S",
    product_name: "Simple",
    total_stock: 50,
    is_active: true,
  },
  {
    product_id: "variant",
    sku: "V",
    product_name: "Variant",
    total_stock: 90,
    is_active: true,
  },
  {
    product_id: "empty",
    sku: "E",
    product_name: "Empty",
    total_stock: 100,
    is_active: true,
  },
];

function setup() {
  const view = query();
  view.range.mockResolvedValue({ data: rows, count: 3, error: null });
  const products = query();
  products.in.mockResolvedValue({
    data: rows.map((row) => ({
      id: row.product_id,
      unit_of_measure: "UNIT",
      has_variants: row.product_id === "variant",
      tracks_stock_units: false,
    })),
    error: null,
  });
  mocks.rpc.mockResolvedValue({
    data: [
      {
        product_id: "simple",
        quantity_available: 40,
        unit_quantity_available: null,
      },
      {
        product_id: "variant",
        quantity_available: 10,
        unit_quantity_available: null,
      },
    ],
    error: null,
  });
  mocks.from.mockImplementation((table: string) => {
    if (table === "view_stock_detail") {
      return view;
    }
    if (table === "products") {
      return products;
    }
    throw new Error(`Unexpected table: ${table}`);
  });
  return { view };
}

describe("warehouse filter integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue({ id: "warehouse" });
  });

  it("replaces global view quantities with warehouse balances and retains zero-stock products and pagination", async () => {
    setup();
    const result = await getStockPaginated("org", {
      page: 1,
      pageSize: 20,
      warehouseId: "warehouse",
    });
    expect(result.data.map((row) => row.total_stock)).toEqual([40, 10, 0]);
    expect(result.totalCount).toBe(3);
    expect(mocks.access).toHaveBeenCalledWith("org", "warehouse", {
      requireActive: false,
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "get_inventory_stock_balances",
      expect.objectContaining({ p_org_id: "org", p_warehouse_id: "warehouse" })
    );
  });

  it("applies warehouse, search, category and status consistently to full exports", async () => {
    const { view } = setup();
    const result = await getAllStockForExport("org", {
      warehouseId: "warehouse",
      search: "shoe",
      category: "Shoes",
      status: "inactive",
    });
    expect(view.or).toHaveBeenCalledWith(
      "sku.ilike.%shoe%,product_name.ilike.%shoe%"
    );
    expect(view.eq).toHaveBeenCalledWith("category_name", "Shoes");
    expect(view.eq).toHaveBeenCalledWith("is_active", false);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "get_inventory_stock_balances",
      expect.objectContaining({ p_warehouse_id: "warehouse" })
    );
    expect(result.map((row) => row.total_stock)).toEqual([40, 10, 0]);
  });

  it("rejects unauthorized warehouse IDs before accessing stock in the table, metrics and export", async () => {
    mocks.access.mockRejectedValue(new Error("No tenés acceso"));
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "denied" },
    });
    await expect(
      getStockPaginated("org", {
        page: 1,
        pageSize: 20,
        warehouseId: "forbidden",
      })
    ).rejects.toThrow("No tenés acceso");
    await expect(getStockMetrics("org", "forbidden")).rejects.toThrow(
      "No tenés acceso"
    );
    await expect(
      getAllStockForExport("org", { warehouseId: "forbidden" })
    ).rejects.toThrow("No tenés acceso");
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

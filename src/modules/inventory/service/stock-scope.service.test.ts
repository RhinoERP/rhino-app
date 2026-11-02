import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/supabase";
import type { StockItem } from "../types";
import {
  calculateWarehouseStockMetrics,
  fetchWarehouseBalances,
} from "./stock-scope.service";

function createClient(
  pages: { data: unknown[] | null; error: { message: string } | null }[]
) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn(),
  };
  for (const page of pages) {
    query.range.mockResolvedValueOnce(page);
  }
  const from = vi.fn().mockReturnValue(query);
  return {
    query,
    from,
    client: { from } as unknown as SupabaseClient<Database>,
  };
}

describe("warehouse stock balances", () => {
  it("scopes queries to organization, warehouse and product IDs and sums multiple lots", async () => {
    const { client, query } = createClient([
      {
        data: [
          {
            product_id: "product",
            quantity_available: 12.5,
            unit_quantity_available: 3,
            variant: null,
          },
          {
            product_id: "product",
            quantity_available: 7.5,
            unit_quantity_available: 2,
            variant: null,
          },
        ],
        error: null,
      },
    ]);
    const balances = await fetchWarehouseBalances(
      client,
      "org",
      "warehouse",
      new Map([["product", { has_variants: false }]])
    );
    expect(query.eq).toHaveBeenCalledWith("organization_id", "org");
    expect(query.eq).toHaveBeenCalledWith("warehouse_id", "warehouse");
    expect(query.in).toHaveBeenCalledWith("product_id", ["product"]);
    expect(balances.get("product")).toEqual({ quantity: 20, units: 5 });
  });

  it("excludes inactive and unlinked variants, while retaining active variant balances", async () => {
    const { client } = createClient([
      {
        data: [
          {
            product_id: "product",
            quantity_available: 10,
            unit_quantity_available: null,
            variant: { is_active: true },
          },
          {
            product_id: "product",
            quantity_available: 100,
            unit_quantity_available: null,
            variant: { is_active: false },
          },
          {
            product_id: "product",
            quantity_available: 1000,
            unit_quantity_available: null,
            variant: null,
          },
        ],
        error: null,
      },
    ]);
    const balances = await fetchWarehouseBalances(
      client,
      "org",
      "warehouse",
      new Map([["product", { has_variants: true }]])
    );
    expect(balances.get("product")?.quantity).toBe(10);
  });

  it("reads past the 1000-row API limit without losing balances", async () => {
    const lot = {
      product_id: "product",
      quantity_available: 1,
      unit_quantity_available: null,
      variant: null,
    };
    const { client, query } = createClient([
      { data: Array.from({ length: 1000 }, () => lot), error: null },
      { data: [lot], error: null },
    ]);
    const balances = await fetchWarehouseBalances(
      client,
      "org",
      "warehouse",
      new Map([["product", { has_variants: false }]])
    );
    expect(balances.get("product")?.quantity).toBe(1001);
    expect(query.range).toHaveBeenNthCalledWith(2, 1000, 1999);
  });

  it("propagates database failures rather than displaying zero stock", async () => {
    const { client } = createClient([
      { data: null, error: { message: "database unavailable" } },
    ]);
    await expect(
      fetchWarehouseBalances(
        client,
        "org",
        "warehouse",
        new Map([["product", { has_variants: false }]])
      )
    ).rejects.toThrow("database unavailable");
  });

  it("does not query lots when the catalogue page is empty", async () => {
    const { client, from } = createClient([]);
    expect(
      await fetchWarehouseBalances(client, "org", "warehouse", new Map())
    ).toEqual(new Map());
    expect(from).not.toHaveBeenCalled();
  });
});

function item(
  id: string,
  quantity: number,
  unit: "UNIT" | "KG" | "LT",
  active = true
): StockItem {
  return {
    product_id: id,
    total_stock: quantity,
    unit_of_measure: unit,
    is_active: active,
  } as StockItem;
}

describe("warehouse metrics", () => {
  it("uses scoped quantities for units, kg, liters and valuation, excluding inactive and zero-stock products", () => {
    const metrics = calculateWarehouseStockMetrics(
      [
        item("units", 40, "UNIT"),
        {
          ...item("weight", 12.5, "KG"),
          tracks_stock_units: true,
          total_unit_stock: 3,
        },
        item("liquid", 7, "LT"),
        item("empty", 0, "UNIT"),
        item("inactive", 100, "UNIT", false),
      ],
      new Map([
        ["units", 2],
        ["weight", 10],
        ["liquid", 5],
        ["inactive", 100],
      ]),
      new Map([["units", 50]])
    );
    expect(metrics).toMatchObject({
      warehouseScoped: true,
      activeProducts: 3,
      inactiveProducts: 1,
      totalProducts: 4,
      totalUnits: 40,
      totalKg: 12.5,
      totalLt: 7,
      totalStockValue: 240,
      lowStockCount: 1,
    });
  });

  it("returns visible zero KPIs for an empty warehouse", () => {
    expect(
      calculateWarehouseStockMetrics(
        [item("empty", 0, "KG")],
        new Map(),
        new Map()
      )
    ).toMatchObject({
      warehouseScoped: true,
      activeProducts: 0,
      totalUnits: 0,
      totalKg: 0,
      totalLt: 0,
      totalStockValue: 0,
    });
  });

  it("keeps global catalogue counts while applying the same active-stock rules to quantities and costs", () => {
    const items = [
      item("active", 10, "UNIT"),
      item("empty", 0, "UNIT"),
      item("inactive-variant", 100, "UNIT", false),
    ];
    const metrics = calculateWarehouseStockMetrics(
      items,
      new Map([
        ["active", 2],
        ["inactive-variant", 100],
      ]),
      new Map(),
      false
    );
    expect(metrics).toMatchObject({
      warehouseScoped: false,
      totalProducts: 3,
      activeProducts: 2,
      inactiveProducts: 1,
      totalUnits: 10,
      totalStockValue: 20,
    });
  });
});

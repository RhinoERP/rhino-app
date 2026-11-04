import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/supabase";
import { parseStockMetrics } from "../utils/stock-metrics-schema";
import { WarehouseAccessError } from "../utils/warehouse-access-error";
import { fetchStockBalances } from "./stock-scope.service";

const metrics = {
  warehouseScoped: false,
  canViewCosts: true,
  totalProducts: 10_000,
  activeProducts: 9000,
  inactiveProducts: 1000,
  totalUnits: 100_000,
  totalKg: 25,
  totalLt: 15,
  lowStockCount: 2,
  totalStockValue: 200_000,
};

function clientWithRpc(rpc: ReturnType<typeof vi.fn>) {
  return { rpc } as unknown as SupabaseClient<Database>;
}

describe("aggregate stock balances", () => {
  it("requests one aggregate row per product rather than downloading lots", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          product_id: "kg",
          quantity_available: 12.5,
          unit_quantity_available: 3,
        },
      ],
      error: null,
    });
    const balances = await fetchStockBalances(
      clientWithRpc(rpc),
      "org",
      ["kg"],
      "warehouse"
    );
    expect(rpc).toHaveBeenCalledExactlyOnceWith(
      "get_inventory_stock_balances",
      { p_org_id: "org", p_product_ids: ["kg"], p_warehouse_id: "warehouse" }
    );
    expect(balances.get("kg")).toEqual({ quantity: 12.5, units: 3 });
  });

  it("omits the warehouse argument for global stock and deduplicates product IDs", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    await fetchStockBalances(clientWithRpc(rpc), "org", ["product", "product"]);
    expect(rpc).toHaveBeenCalledExactlyOnceWith(
      "get_inventory_stock_balances",
      { p_org_id: "org", p_product_ids: ["product"] }
    );
  });

  it("bounds each export block below the PostgREST row limit without truncating products", async () => {
    const rpc = vi.fn().mockImplementation((_name, args) =>
      Promise.resolve({
        data: args.p_product_ids.map((id: string) => ({
          product_id: id,
          quantity_available: 1,
          unit_quantity_available: 0,
        })),
        error: null,
      })
    );
    const ids = Array.from({ length: 1001 }, (_, index) => `product-${index}`);
    const balances = await fetchStockBalances(clientWithRpc(rpc), "org", ids);
    expect(balances.size).toBe(1001);
    expect(rpc.mock.calls.map((call) => call[1].p_product_ids.length)).toEqual([
      500, 500, 1,
    ]);
  });

  it("does not interpret an empty page as a complete-catalogue request", async () => {
    const rpc = vi.fn();
    expect(await fetchStockBalances(clientWithRpc(rpc), "org", [])).toEqual(
      new Map()
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["42501", 403],
    ["22023", 400],
  ])("maps SQLSTATE %s to an expected access/input error", async (code, status) => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { code, message: "denied" } });
    await expect(
      fetchStockBalances(clientWithRpc(rpc), "org", ["product"])
    ).rejects.toMatchObject({ status, name: "WarehouseAccessError" });
  });

  it("propagates timeouts rather than returning zero balances", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "57014", message: "statement timeout" },
    });
    await expect(
      fetchStockBalances(clientWithRpc(rpc), "org", ["product"])
    ).rejects.toThrow("statement timeout");
  });

  it("rejects an absent RPC result", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    await expect(
      fetchStockBalances(clientWithRpc(rpc), "org", ["product"])
    ).rejects.toThrow("No se recibieron");
  });
});

describe("metrics response contract", () => {
  it("retains the complete-scope aggregate rather than deriving statistics from a page", () => {
    expect(parseStockMetrics(metrics)).toEqual(metrics);
  });

  it("strips valuations when the server response does not authorize them", () => {
    const result = parseStockMetrics({ ...metrics, canViewCosts: false });
    expect(result.canViewCosts).toBe(false);
    expect(result).not.toHaveProperty("totalStockValue");
  });

  it("does not replace a missing authorized valuation with a misleading zero", () => {
    const { totalStockValue: _cost, ...missingCost } = metrics;
    expect(() => parseStockMetrics(missingCost)).toThrow("inválida");
  });

  it("rejects incomplete and invalid indicator payloads", () => {
    expect(() => parseStockMetrics({})).toThrow("inválida");
    expect(() =>
      parseStockMetrics({ ...metrics, totalProducts: "10000" })
    ).toThrow("inválida");
    expect(() =>
      parseStockMetrics({ ...metrics, totalUnits: Number.NaN })
    ).toThrow("inválida");
    expect(new WarehouseAccessError("denied", 403)).toBeInstanceOf(Error);
  });
});

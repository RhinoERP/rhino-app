import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StockMetrics } from "../types";
import { scopedStockMetricsQueryKey, stockMetricsQueryKey } from "./query-keys";
import { stockMetricsQueryOptions } from "./stock-metrics.client";

const metrics = {
  warehouseScoped: false,
  canViewCosts: false,
  totalProducts: 3000,
  activeProducts: 2500,
  inactiveProducts: 500,
  totalUnits: 12_000,
  totalKg: 15,
  totalLt: 6,
  lowStockCount: 1,
} satisfies StockMetrics;
const client = new QueryClient();
afterEach(() => {
  client.clear();
  vi.unstubAllGlobals();
});

describe("stock metrics cache scope", () => {
  it("reuses the same aggregate query across table navigation instead of fetching it again", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(metrics));
    vi.stubGlobal("fetch", fetch);
    const options = stockMetricsQueryOptions("org", "user:reader");
    const observer = new QueryObserver(client, options);
    const unsubscribe = observer.subscribe(vi.fn());
    await client.fetchQuery(options);
    observer.setOptions(stockMetricsQueryOptions("org", "user:reader"));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe("/api/org/org/stock/metrics");
    unsubscribe();
    observer.destroy();
  });

  it("isolates organizations, warehouses and user/permission contexts", () => {
    const base = scopedStockMetricsQueryKey("org", "user:reader");
    expect(scopedStockMetricsQueryKey("other-org", "user:reader")).not.toEqual(
      base
    );
    expect(scopedStockMetricsQueryKey("org", "other-user:reader")).not.toEqual(
      base
    );
    expect(scopedStockMetricsQueryKey("org", "user:admin")).not.toEqual(base);
    expect(
      scopedStockMetricsQueryKey("org", "user:reader", "warehouse")
    ).not.toEqual(base);
  });

  it("refreshes a cached warehouse when switching scope instead of reusing potentially outdated stock", async () => {
    const fetch = vi
      .fn()
      .mockImplementation(() => Promise.resolve(Response.json(metrics)));
    vi.stubGlobal("fetch", fetch);
    const global = stockMetricsQueryOptions("org", "user");
    const warehouse = stockMetricsQueryOptions("org", "user", "warehouse");
    client.setQueryData(warehouse.queryKey, metrics);
    const observer = new QueryObserver(client, global);
    const unsubscribe = observer.subscribe(vi.fn());
    await client.fetchQuery(global);
    observer.setOptions(warehouse);
    await client.fetchQuery(warehouse);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0]).toBe(
      "/api/org/org/stock/metrics?warehouseId=warehouse"
    );
    unsubscribe();
    observer.destroy();
  });

  it("invalidates every warehouse aggregate of an organization after a product mutation", async () => {
    const global = scopedStockMetricsQueryKey("org", "user");
    const warehouse = scopedStockMetricsQueryKey("org", "user", "warehouse");
    const otherOrg = scopedStockMetricsQueryKey("other", "user");
    for (const key of [global, warehouse, otherOrg]) {
      client.setQueryData(key, metrics);
    }
    await client.invalidateQueries({ queryKey: stockMetricsQueryKey("org") });
    expect(client.getQueryState(global)?.isInvalidated).toBe(true);
    expect(client.getQueryState(warehouse)?.isInvalidated).toBe(true);
    expect(client.getQueryState(otherOrg)?.isInvalidated).toBe(false);
  });

  it("supports cancellation, fresh reads on return/focus and no automatic timeout retry storm", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(metrics));
    vi.stubGlobal("fetch", fetch);
    const options = stockMetricsQueryOptions("org", "user", "warehouse");
    await client.fetchQuery(options);
    expect(fetch).toHaveBeenCalledWith(
      "/api/org/org/stock/metrics?warehouseId=warehouse",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        cache: "no-store",
      })
    );
    expect(options).toMatchObject({
      retry: false,
      refetchOnMount: "always",
      refetchOnWindowFocus: "always",
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCustomerProfitabilityDashboard,
  getFinancialBreakdown,
} from "./dashboard.service";
import { generateMonthlyReportData } from "./monthly-report.service";

const mocks = vi.hoisted(() => ({ from: vi.fn(), eq: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: mocks.from }),
}));
const from = new Date(2026, 10, 1);
const to = new Date(2026, 10, 30);

describe("secondary reports keep wholesale and Meli separate", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.from.mockImplementation((table: string) => {
      const filters: ((row: Record<string, unknown>) => boolean)[] = [];
      const rows: Record<string, unknown>[] =
        table === "sales_orders"
          ? [
              {
                id: "wholesale",
                organization_id: "org",
                sales_channel: "WHOLESALE",
                document_type: "STANDARD",
                is_historical: false,
                status: "DELIVERED",
                currency: "ARS",
                total_amount: 121,
                sub_total: 100,
                customer_id: "customer",
                items: [],
                customer: {
                  id: "customer",
                  business_name: "Mayorista",
                  fantasy_name: null,
                },
                customers: { id: "customer", name: "Mayorista" },
              },
              {
                id: "meli",
                organization_id: "org",
                sales_channel: "MERCADO_LIBRE",
                document_type: "STANDARD",
                is_historical: false,
                status: "DELIVERED",
                currency: "ARS",
                total_amount: 999,
                sub_total: 999,
                customer_id: null,
                items: [],
                customers: { id: "occasional", name: "Comprador Meli" },
              },
            ]
          : [];
      const promise = Promise.resolve().then(() => ({
        data: rows.filter((row) => filters.every((filter) => filter(row))),
        error: null,
      }));
      const query = Object.assign(promise, {
        select: () => query,
        order: () => query,
        limit: () => query,
        gte: () => query,
        lte: () => query,
        lt: () => query,
        eq: (key: string, value: unknown) => {
          mocks.eq(table, key, value);
          filters.push((row) => row[key] === value);
          return query;
        },
        neq: (key: string, value: unknown) => {
          filters.push((row) => row[key] !== value);
          return query;
        },
        in: (key: string, values: unknown[]) => {
          filters.push((row) => values.includes(row[key]));
          return query;
        },
        single: () =>
          Promise.resolve({
            data: { id: "org", name: "Empresa" },
            error: null,
          }),
      });
      return query;
    });
  });
  it("does not classify Mercado Pago revenue as wholesale invoicing or cash collections", async () => {
    const result = await getFinancialBreakdown("org", from, to);
    expect(result.invoicing.normalSales).toBe(121);
    expect(result.invoicing.normalSalesCount).toBe(1);
    expect(result.cashCollections.totalCash).toBe(0);
  });
  it("does not attribute an occasional Meli buyer to wholesale customer profitability", async () => {
    await getCustomerProfitabilityDashboard("org", from, to);
    expect(mocks.eq).toHaveBeenCalledWith(
      "sales_orders",
      "sales_channel",
      "WHOLESALE"
    );
    expect(mocks.eq).toHaveBeenCalledWith(
      "sales_returns",
      "sale.sales_channel",
      "WHOLESALE"
    );
  });
  it("keeps monthly rankings and order delays in the wholesale channel", async () => {
    const result = await generateMonthlyReportData("org", 11, 2026);
    expect(result.topClients.ars).toEqual([{ name: "Mayorista", value: 121 }]);
    expect(mocks.eq).toHaveBeenCalledWith(
      "sales_order_items",
      "sales_orders.sales_channel",
      "WHOLESALE"
    );
    expect(mocks.eq).toHaveBeenCalledWith(
      "sales_order_items",
      "sales_orders.document_type",
      "STANDARD"
    );
  });
});

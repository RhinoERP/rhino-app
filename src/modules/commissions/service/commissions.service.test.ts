import { expect, it, vi } from "vitest";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/supabase/admin-client", () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        getUserById: async () => ({
          data: { user: { user_metadata: { full_name: "Seller" } } },
          error: null,
        }),
      },
    },
  }),
}));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: async () => ({ id: "org-1" }),
}));

import { getCommissionsPaginated } from "./commissions.service";

it("includes the historical supplier rate in the sale reference total and remaining commission", async () => {
  const commission = {
    id: "commission-1",
    user_id: "seller-1",
    sales_order_id: "sale-1",
    base_commission_rate: 0,
    extra_commission_rate: 0,
    supplier_commission_rate: 1,
    commission_amount: 50,
    paid_amount: 6050,
    created_at: "2026-10-26T15:00:00Z",
  };
  const selects: string[] = [];
  createClient.mockResolvedValue({
    from: (table: string) => {
      let selection = "";
      const query = {
        select: (value: string) => {
          selection = value;
          selects.push(value);
          return query;
        },
        eq: () => query,
        in: () => query,
        gte: () => query,
        lte: () => query,
        order: () => query,
        // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are awaitable.
        then: (resolve: (value: unknown) => unknown) => {
          const rows: Record<string, unknown[]> = {
            commissions:
              selection === "user_id"
                ? [{ user_id: "seller-1" }]
                : [commission],
            sales_orders: [
              {
                id: "sale-1",
                sale_number: 1,
                sub_total: 10_000,
                customers: { business_name: "Customer" },
              },
            ],
            organization_members: [
              { user_id: "seller-1", base_commission_rate: 0 },
            ],
            accounts_receivable: [
              { sales_order_id: "sale-1", status: "PARTIALLY_PAID" },
            ],
          };
          return Promise.resolve({ data: rows[table], error: null }).then(
            resolve
          );
        },
      };
      return query;
    },
  });

  const result = await getCommissionsPaginated("org", {
    page: 1,
    pageSize: 20,
    month: "2026-10",
  });
  expect(result.data[0].sales[0]).toMatchObject({
    commissionRate: 1,
    totalCommission: 100,
    paidCommission: 50,
    remainingCommission: 50,
    status: "PARTIAL",
  });
  expect(
    selects.some((value) => value.includes("supplier_commission_rate"))
  ).toBe(true);
});

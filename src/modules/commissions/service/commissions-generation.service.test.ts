import { describe, expect, it, vi } from "vitest";
import { resolvePaymentCurrencyFields } from "@/modules/collections/utils/payment-currency";
import { recalculateCommissionsForPayment } from "./commissions-generation.service";

type Client = Parameters<typeof recalculateCommissionsForPayment>[0];

function mockClient({
  commissions = [
    {
      id: "commission-1",
      sales_order_id: "sale-1",
      base_commission_rate: 0,
      extra_commission_rate: 0,
      supplier_commission_rate: 1,
    },
  ],
  updateError = null,
}: {
  commissions?: Array<{
    id: string;
    sales_order_id: string;
    base_commission_rate: number;
    extra_commission_rate: number;
    supplier_commission_rate: number;
  }>;
  updateError?: { message: string } | null;
} = {}) {
  const updates: unknown[] = [];
  const filters: unknown[][] = [];
  const results = [
    { data: commissions, error: null },
    {
      data: [{ id: "sale-1", sub_total: 100, total_amount: 121 }],
      error: null,
    },
    { data: null, error: updateError },
  ];
  const from = vi.fn((table: string) => {
    const result = results.shift();
    const query = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      eq: vi.fn((...args: unknown[]) => {
        filters.push([table, ...args]);
        return query;
      }),
      update: vi.fn((values: unknown) => {
        updates.push(values);
        return query;
      }),
      // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are awaitable.
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve(result).then(resolve),
    };
    return query;
  });
  return { client: { from } as unknown as Client, from, updates, filters };
}

describe("recalculateCommissionsForPayment", () => {
  it("reduces commission on the new payment subtotal using historical supplier rates", async () => {
    const { client, from, updates, filters } = mockClient();
    await recalculateCommissionsForPayment(
      client,
      "org-1",
      "payment-1",
      1_000_000
    );

    expect(updates).toEqual([
      { paid_amount: 1_000_000, commission_amount: 8264.46 },
    ]);
    expect(from.mock.calls.map(([table]) => table)).toEqual([
      "commissions",
      "sales_orders",
      "commissions",
    ]);
    expect(filters).toContainEqual([
      "commissions",
      "receivable_payment_id",
      "payment-1",
    ]);
    expect(filters.filter(([, key]) => key === "organization_id")).toHaveLength(
      3
    );
  });

  it("uses the ARS valuation of an edited USD payment and sums all snapshot rates", async () => {
    const { client, updates } = mockClient({
      commissions: [
        {
          id: "commission-1",
          sales_order_id: "sale-1",
          base_commission_rate: 3,
          extra_commission_rate: -2,
          supplier_commission_rate: 1,
        },
      ],
    });
    const payment = resolvePaymentCurrencyFields("USD", 100, 1210);
    await recalculateCommissionsForPayment(
      client,
      "org-1",
      "payment-1",
      payment.amountArs
    );
    expect(updates).toEqual([
      { paid_amount: 121_000, commission_amount: 2000 },
    ]);
  });

  it("does not create commissions for a payment without historical commission rows", async () => {
    const { client, from, updates } = mockClient({ commissions: [] });
    await recalculateCommissionsForPayment(client, "org-1", "payment-1", 100);
    expect(from).toHaveBeenCalledTimes(1);
    expect(updates).toEqual([]);
  });

  it("surfaces persistence errors so the edit cannot silently leave stale commissions", async () => {
    const { client } = mockClient({
      updateError: { message: "Commission update failed" },
    });
    await expect(
      recalculateCommissionsForPayment(client, "org-1", "payment-1", 100)
    ).rejects.toThrow("Commission update failed");
  });
});

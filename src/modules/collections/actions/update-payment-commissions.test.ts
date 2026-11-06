import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient, recalculate, revalidatePath } = vi.hoisted(() => ({
  createClient: vi.fn(),
  recalculate: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/modules/organizations/utils/with-permission-guard", () => ({
  ensure: vi.fn(),
}));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: vi.fn(async () => ({ id: "org-1" })),
}));
vi.mock("@/modules/collections/service/collections.service", () => ({
  deriveReceivableCreditSupplier: vi.fn(),
}));
vi.mock("@/modules/commissions/service/commissions-generation.service", () => ({
  recalculateCommissionsForPayment: recalculate,
}));

import { updatePaymentAction } from "./update-payment.action";

vi.mock("@/modules/collections/utils/payment-rate", () => ({
  resolveReceivableExchangeRate: async ({
    receivable,
  }: {
    receivable: { currency: string };
  }) => (receivable.currency === "USD" ? 1100.123_456 : null),
  resolvePayableExchangeRate: vi.fn(),
}));

function setupClient(currency: string, accountError = false) {
  const results = [
    {
      data: {
        id: "payment-1",
        amount: 200,
        exchange_rate: currency === "USD" ? 1000 : null,
        account_receivable_id: "account-1",
        payment_method: "efectivo",
      },
      error: null,
    },
    {
      data: {
        id: "account-1",
        total_amount: 200,
        pending_balance: 0,
        customer_id: "customer-1",
        currency,
      },
      error: null,
    },
    { data: null, error: null },
    {
      data: null,
      error: accountError ? { message: "Account update failed" } : null,
    },
  ];
  const from = vi.fn(() => {
    const result = results.shift();
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => result),
      // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are awaitable.
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve(result).then(resolve),
    };
    return query;
  });
  const client = { from };
  createClient.mockResolvedValue(client);
  return client;
}

const input = {
  orgSlug: "org",
  paymentId: "payment-1",
  accountId: "account-1",
  type: "receivable" as const,
  amount: 100,
  paymentMethod: "efectivo" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  recalculate.mockResolvedValue(undefined);
});

describe("payment edits synchronize commissions", () => {
  it.each([
    ["ARS", undefined, 100],
    ["USD", 9999, 110_012.34],
  ])("passes the edited %s payment valuation in ARS", async (currency, rate, amountArs) => {
    const client = setupClient(currency);
    const result = await updatePaymentAction({ ...input, exchangeRate: rate });
    expect(result).toMatchObject({
      success: true,
      newPendingBalance: 100,
      newStatus: "PARTIAL",
    });
    expect(recalculate).toHaveBeenCalledWith(
      client,
      "org-1",
      "payment-1",
      amountArs
    );
    expect(revalidatePath).toHaveBeenCalledWith("/org/org/comisiones");
  });

  it("reports commission failure explicitly after the payment and balance changed", async () => {
    setupClient("ARS");
    recalculate.mockRejectedValueOnce(new Error("Commission update failed"));
    const result = await updatePaymentAction(input);
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("El pago y el saldo se actualizaron"),
    });
    expect(revalidatePath).toHaveBeenCalledWith("/org/org/cobranzas");
  });

  it("does not recalculate commissions if the account balance failed to update", async () => {
    setupClient("ARS", true);
    expect(await updatePaymentAction(input)).toMatchObject({ success: false });
    expect(recalculate).not.toHaveBeenCalled();
  });
});

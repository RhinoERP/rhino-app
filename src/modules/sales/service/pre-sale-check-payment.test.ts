import { expect, it, vi } from "vitest";

const createClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClient(...args),
}));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: vi.fn(async () => ({ id: "org-1" })),
}));
vi.mock("./sales.service", () => ({
  getSalesAccessContext: vi.fn(async () => ({
    canManage: true,
    isOrganizationAdmin: true,
  })),
}));

const { deletePreSale } = await import("./pre-sale.service");

it.each([
  "cheque",
  "e-cheq",
])("no elimina una preventa con cobro %s", async (method) => {
  const from = vi.fn((table: string) => {
    let result: unknown = { id: "payment-1", payment_method: method };
    if (table === "sales_orders") {
      result = { id: "sale-1", status: "PENDING", arca_status: null };
    } else if (table === "accounts_receivable") {
      result = [{ id: "ar-1" }];
    }
    let eqCount = 0;
    const chain = {
      select: () => chain,
      eq: () => {
        eqCount += 1;
        return table === "accounts_receivable" && eqCount === 2
          ? Promise.resolve({ data: result, error: null })
          : chain;
      },
      in: () => chain,
      limit: () => chain,
      maybeSingle: () => Promise.resolve({ data: result, error: null }),
    };
    return chain;
  });
  createClient.mockResolvedValue({ from });

  await expect(deletePreSale("org", "sale-1")).rejects.toThrow(
    "Gestioná el cheque desde Tesorería"
  );
  expect(from).toHaveBeenCalledTimes(3);
});

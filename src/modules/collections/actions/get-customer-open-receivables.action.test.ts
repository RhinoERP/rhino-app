import { beforeEach, describe, expect, it, vi } from "vitest";
import { getReceivablesByOrgSlug } from "@/modules/collections/service/collections.service";
import { ensureCollectionsRead } from "@/modules/collections/utils/permissions";
import { getCustomerOpenReceivablesAction } from "./get-customer-open-receivables.action";

vi.mock("@/modules/collections/service/collections.service", () => ({
  getReceivablesByOrgSlug: vi.fn(),
}));
vi.mock("@/modules/collections/utils/permissions", () => ({
  ensureCollectionsRead: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

describe("open receivables for a selected customer", () => {
  it("returns only pending accounts within the existing collections scope", async () => {
    vi.mocked(getReceivablesByOrgSlug).mockResolvedValue([
      {
        id: "one",
        customer_id: "selected",
        pending_balance: 12,
        total_amount: 20,
        currency: "ARS",
        due_date: "2026-11-19",
        sale: { invoice_number: "F-1", sale_number: 7 },
      },
      { id: "paid", customer_id: "selected", pending_balance: 0 },
      { id: "other", customer_id: "someone-else", pending_balance: 99 },
    ] as never);
    const result = await getCustomerOpenReceivablesAction("org", "selected");
    expect(ensureCollectionsRead).toHaveBeenCalledWith("org");
    expect(getReceivablesByOrgSlug).toHaveBeenCalledWith("org");
    expect(result).toEqual([
      {
        id: "one",
        invoiceNumber: "F-1",
        saleNumber: 7,
        saleDate: null,
        dueDate: "2026-11-19",
        currency: "ARS",
        totalAmount: 20,
        pendingBalance: 12,
      },
    ]);
  });

  it("does not fetch receivables without collections permission", async () => {
    vi.mocked(ensureCollectionsRead).mockRejectedValue(new Error("Forbidden"));
    await expect(
      getCustomerOpenReceivablesAction("org", "selected")
    ).rejects.toThrow("Forbidden");
    expect(getReceivablesByOrgSlug).not.toHaveBeenCalled();
  });
});

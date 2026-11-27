import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ exportBatch: vi.fn() }));
vi.mock("../service/chess-purchase-history.service", () => ({
  getPurchaseHistoryExport: mocks.exportBatch,
}));

import { exportChessPurchasesAction } from "./export-chess-purchases.action";

describe("historical purchase export scope", () => {
  beforeEach(() => {
    mocks.exportBatch.mockReset();
    mocks.exportBatch.mockResolvedValue({ data: [], totalCount: 0 });
  });
  it("forwards filters for filtered export and ignores them for the full archive", async () => {
    const filters = { search: "SHERATON", dateFrom: "2020-01-01" };
    await exportChessPurchasesAction("org", "filtered", filters, 500);
    expect(mocks.exportBatch).toHaveBeenLastCalledWith("org", filters, 500);
    await exportChessPurchasesAction("org", "all", filters, 500);
    expect(mocks.exportBatch).toHaveBeenLastCalledWith("org", {}, 500);
  });
});

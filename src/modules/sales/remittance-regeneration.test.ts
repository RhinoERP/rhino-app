import { describe, expect, it, vi } from "vitest";
import { regenerateAuthorizedSaleRemittances } from "./remittance-regeneration";

const params = {
  orgSlug: "acme",
  orgId: "org-1",
  saleId: "sale-1",
};

describe("regenerateAuthorizedSaleRemittances", () => {
  it("regenerates the sale and child-order remittances", async () => {
    const childOrderRemittances = vi.fn().mockResolvedValue(undefined);
    const saleRemittance = vi.fn().mockResolvedValue(undefined);

    await regenerateAuthorizedSaleRemittances(params, {
      childOrderRemittances,
      saleRemittance,
    });

    expect(childOrderRemittances).toHaveBeenCalledWith(params);
    expect(saleRemittance).toHaveBeenCalledWith(params);
  });

  it("does not fail the invoice flow when a remittance regeneration fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => null);

    await expect(
      regenerateAuthorizedSaleRemittances(params, {
        childOrderRemittances: vi
          .fn()
          .mockRejectedValue(new Error("upload failed")),
        saleRemittance: vi.fn().mockResolvedValue(undefined),
      })
    ).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

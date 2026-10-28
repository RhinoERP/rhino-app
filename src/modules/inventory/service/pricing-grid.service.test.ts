import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getOrganizationBySlug: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: mocks.getOrganizationBySlug,
}));

import {
  updateDirectMargin,
  updateWholesaleMargin,
  updateWholesalePrice,
} from "./pricing-grid.service";

describe("pricing grid margin persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrganizationBySlug.mockResolvedValue({ id: "org-1" });
  });

  it("stores enough margin precision to preserve a manually entered wholesale price", async () => {
    const update = vi.fn();
    const productQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      single: vi.fn().mockResolvedValue({
        data: { cost_price: 47_000 },
        error: null,
      }),
    };
    productQuery.select.mockReturnValue(productQuery);
    productQuery.eq.mockReturnValue(productQuery);
    const updateQuery = { eq: vi.fn() };
    updateQuery.eq.mockReturnValueOnce(updateQuery).mockResolvedValueOnce({
      error: null,
    });
    update.mockReturnValue(updateQuery);
    mocks.createClient.mockResolvedValue({
      from: (table: string) =>
        table === "products_with_price" ? productQuery : { update },
    });

    await updateWholesalePrice("org", "product-1", 50_000);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ profit_margin: 6.382_978_723_4 })
    );
  });

  it("passes a precise margin to both margin-edit RPCs", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    mocks.createClient.mockResolvedValue({ rpc });

    await updateWholesaleMargin("org", "product-1", 6.382_979);
    await updateDirectMargin("org", "product-1", 6.382_979);

    expect(rpc).toHaveBeenNthCalledWith(1, "update_product_profit_margin", {
      p_org_id: "org-1",
      p_product_id: "product-1",
      p_margin: 6.382_979,
    });
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "upsert_direct_sale_price_for_margin",
      {
        p_org_id: "org-1",
        p_product_id: "product-1",
        p_margin: 6.382_979,
      }
    );
  });
});

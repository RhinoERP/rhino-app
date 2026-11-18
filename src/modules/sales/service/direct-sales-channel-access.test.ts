import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getDirectSaleById,
  getDirectSalesByOrgSlug,
  searchDirectSaleProducts,
} from "./direct-sales.service";

const mocks = vi.hoisted(() => ({
  ensure: vi.fn(),
  getSale: vi.fn(),
  list: vi.fn(),
  search: vi.fn(),
}));
vi.mock("@/modules/organizations/utils/with-permission-guard", () => ({
  ensure: mocks.ensure,
}));
vi.mock("@/modules/pos/service/pos.service", () => ({
  createPosSale: vi.fn(),
  getPosSaleById: mocks.getSale,
  getPosSalesByOrgSlug: mocks.list,
  searchPosProductsForTerminal: mocks.search,
}));
vi.mock("@/modules/pos/service/pos-terminals.service", () => ({
  getPosTerminalsByOrgSlug: vi.fn(),
}));

describe("direct sales POS channel boundaries", () => {
  beforeEach(() => vi.clearAllMocks());
  it("does not grant POS detail access through a Mercado Libre permission", async () => {
    mocks.ensure.mockRejectedValueOnce(new Error("Sin acceso POS"));
    await expect(getDirectSaleById("org", "sale")).rejects.toThrow(
      "Sin acceso POS"
    );
    expect(mocks.getSale).not.toHaveBeenCalled();
    expect(mocks.ensure).toHaveBeenCalledWith(
      ["pos.read", "pos.read.all", "pos.manage"],
      "org"
    );
  });
  it("preserves existing POS readers and the delegated list", async () => {
    mocks.ensure.mockResolvedValueOnce(undefined);
    mocks.list.mockResolvedValueOnce({ data: [], count: 0 });
    expect(await getDirectSalesByOrgSlug("org", { page: 1 })).toEqual({
      data: [],
      count: 0,
    });
    expect(mocks.list).toHaveBeenCalledWith("org", { page: 1 });
  });
  it("guards the legacy product search before invoking its session-based service", async () => {
    mocks.ensure.mockRejectedValueOnce(new Error("Sin acceso POS"));
    await expect(
      searchDirectSaleProducts({ orgSlug: "org", q: "producto" })
    ).rejects.toThrow("Sin acceso POS");
    expect(mocks.search).not.toHaveBeenCalled();
  });
});

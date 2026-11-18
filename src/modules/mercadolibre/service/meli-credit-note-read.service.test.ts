import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getMeliCreditSource,
  listMeliCreditNotes,
} from "./meli-credit-note-read.service";

const mocks = vi.hoisted(() => ({
  sale: vi.fn(),
  from: vi.fn(),
  eq: vi.fn(),
  rows: [] as { id: string; amount: number; status: string }[],
}));
vi.mock("server-only", () => ({}));
vi.mock("./meli-read.service", () => ({ getMeliSale: mocks.sale }));
vi.mock("@/modules/organizations/utils/with-permission-guard", () => ({
  ensure: vi.fn(),
}));
vi.mock("@/modules/organizations/service/module-access.service", () => ({
  guardOrganizationModuleAccess: vi.fn(),
}));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: async () => ({ id: "org" }),
}));
vi.mock("@/lib/supabase/admin-client", () => ({
  createTypedAdminClient: () => ({ from: mocks.from }),
}));
describe("Meli credit note readers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.rows = [];
    mocks.sale.mockResolvedValue({
      id: "sale",
      organizationId: "org",
      warehouse_id: "warehouse",
      total_amount: 2000,
    });
    const query = {
      select: () => query,
      eq: mocks.eq,
      order: () => query,
      maybeSingle: async () => ({ data: { id: "sale" }, error: null }),
      range: async (from: number, to: number) => ({
        data: mocks.rows.slice(from, to + 1),
        error: null,
      }),
    };
    mocks.from.mockReturnValue(query);
    mocks.eq.mockReturnValue(query);
  });
  it("does not elevate a read when the source sale is outside assigned warehouses", async () => {
    mocks.sale.mockResolvedValue(null);
    await expect(getMeliCreditSource("org", "sale")).rejects.toThrow("fuera");
    await expect(listMeliCreditNotes("org", "sale")).rejects.toThrow("fuera");
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("scopes fiscal source reads to tenant, channel and warehouse", async () => {
    await getMeliCreditSource("org", "sale");
    expect(mocks.eq).toHaveBeenCalledWith("organization_id", "org");
    expect(mocks.eq).toHaveBeenCalledWith("sales_channel", "MERCADO_LIBRE");
    expect(mocks.eq).toHaveBeenCalledWith("warehouse_id", "warehouse");
  });
  it("includes every confirmed credit reservation beyond the API row limit", async () => {
    mocks.rows = Array.from({ length: 1200 }, (_, index) => ({
      id: `note-${index}`,
      amount: 1.01,
      status: "CONFIRMED",
    }));
    mocks.rows.push({ id: "cancelled", amount: 100, status: "CANCELLED" });
    const result = await listMeliCreditNotes("org", "sale");
    expect(result.notes).toHaveLength(1201);
    expect(result.remaining).toBe(788);
  });
});

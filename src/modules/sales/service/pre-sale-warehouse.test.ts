import { beforeEach, describe, expect, it, vi } from "vitest";
import PreSalePage from "@/app/org/[orgSlug]/preventa/nueva/page";

const mocks = vi.hoisted(() => ({ warehouses: vi.fn(), products: vi.fn() }));
vi.mock("@/components/sales/forms/pre-sale-form", () => ({
  PreSaleForm: () => null,
}));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: async () => ({
    id: "org",
    name: "Org",
    production_enabled: false,
    cuit: null,
  }),
}));
vi.mock("@/modules/organizations/service/members.service", () => ({
  getOrganizationSalesMembersBySlug: async () => [],
}));
vi.mock("@/modules/customers/service/customers.service", () => ({
  getCustomersByOrgSlug: async () => [],
}));
vi.mock("@/modules/taxes/service/taxes.service", () => ({
  getActiveTaxesByOrgSlug: async () => [],
}));
vi.mock("@/modules/price-levels/service/price-levels.service", () => ({
  getPriceLevelsByOrgSlug: async () => [],
}));
vi.mock("@/modules/inventory/service/warehouse-stock.service", () => ({
  getAvailableWarehouses: mocks.warehouses,
}));
vi.mock("./sales.service", () => ({
  getSaleProducts: mocks.products,
  getSalesAccessContext: async () => ({
    canManage: true,
    canViewAll: true,
    userId: "seller",
  }),
}));

const renderPage = () =>
  PreSalePage({ params: Promise.resolve({ orgSlug: "org" }) });

describe("single-warehouse pre-sale initialization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.products.mockResolvedValue([]);
  });

  it("automatically supplies the sole primary warehouse and loads stock from that warehouse", async () => {
    mocks.warehouses.mockResolvedValue([
      { id: "principal", name: "Principal", is_default: true },
    ]);
    const page = await renderPage();
    expect(page.props.initialWarehouseId).toBe("principal");
    expect(page.props.warehouses).toEqual([
      { id: "principal", name: "Principal", is_default: true },
    ]);
    expect(mocks.products).toHaveBeenCalledWith("org", "principal");
    expect(mocks.warehouses).toHaveBeenCalledWith("org", "wholesale");
  });

  it("uses the sole authorized secondary warehouse instead of assuming access to the principal", async () => {
    mocks.warehouses.mockResolvedValue([
      { id: "secondary", name: "Sucursal", is_default: false },
    ]);
    const page = await renderPage();
    expect(page.props.initialWarehouseId).toBe("secondary");
    expect(mocks.products).toHaveBeenCalledWith("org", "secondary");
  });

  it("never falls back to an unauthorized warehouse when none are available", async () => {
    mocks.warehouses.mockResolvedValue([]);
    const page = await renderPage();
    expect(page.props.initialWarehouseId).toBeUndefined();
    expect(page.props.warehouses).toEqual([]);
    expect(page.props.products).toEqual([]);
    expect(mocks.products).not.toHaveBeenCalled();
  });
});

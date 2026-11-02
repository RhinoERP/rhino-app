import { beforeEach, describe, expect, it, vi } from "vitest";
import StockPage from "@/app/org/[orgSlug]/stock/page";
import { StockWarehouseNotice } from "@/components/stock/stock-warehouse-notice";
import { WarehouseAccessError } from "../utils/warehouse-access-error";

const mocks = vi.hoisted(() => ({
  warehouses: vi.fn(),
  stock: vi.fn(),
  metrics: vi.fn(),
}));
vi.mock("@/modules/organizations/service/module-access.service", () => ({
  guardOrganizationPermissionAccess: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationLayoutData: async () => ({ permissions: ["inventory.read"] }),
  getOrganizationBySlug: async () => ({ id: "org" }),
}));
vi.mock("./warehouse-stock.service", () => ({
  getAvailableWarehouses: mocks.warehouses,
}));
vi.mock("./inventory.service", () => ({
  getStockPaginated: mocks.stock,
  getStockMetrics: mocks.metrics,
  getSuppliers: async () => [],
}));
vi.mock("@/modules/categories/service/categories.service", () => ({
  getCategoriesByOrgSlug: async () => [],
}));
vi.mock("@/modules/taxes/service/taxes.service", () => ({
  getActiveTaxesByOrgSlug: async () => [],
}));
vi.mock("@/components/products/add-product-dialog", () => ({
  AddProductDialog: () => null,
}));
vi.mock("@/components/stock/stock-transfer-history-dialog", () => ({
  StockTransferHistoryDialog: () => null,
}));
vi.mock("@/components/stock/warehouse-stock-breakdown-dialog", () => ({
  WarehouseStockBreakdownDialog: () => null,
}));
vi.mock("@/app/org/[orgSlug]/stock/data-table", () => ({
  StockDataTable: () => null,
}));

const warehouseId = "22222222-2222-4222-8222-222222222222";
const renderPage = (deposito: string) =>
  StockPage({
    params: Promise.resolve({ orgSlug: "org" }),
    searchParams: Promise.resolve({ deposito, search: "shoe", page: "3" }),
  });

describe("expected warehouse errors in the stock page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.warehouses.mockResolvedValue([]);
    mocks.stock.mockResolvedValue({ data: [], totalCount: 0 });
    mocks.metrics.mockResolvedValue(null);
  });

  it("renders a recovery notice for an invalid URL without loading all-warehouse data", async () => {
    const page = await renderPage("invalid");
    expect(page.type).toBe(StockWarehouseNotice);
    expect(page.props.message).toContain("inválido");
    expect(mocks.stock).not.toHaveBeenCalled();
    expect(mocks.metrics).not.toHaveBeenCalled();
  });

  it("renders a recovery notice for removed or inaccessible warehouses", async () => {
    const page = await renderPage(warehouseId);
    expect(page.type).toBe(StockWarehouseNotice);
    expect(page.props.message).toContain("no está disponible");
    expect(mocks.stock).not.toHaveBeenCalled();
  });

  it("handles permission revocation between loading choices and querying stock", async () => {
    mocks.warehouses.mockResolvedValue([
      { id: warehouseId, name: "Principal", is_active: true },
    ]);
    mocks.stock.mockRejectedValue(
      new WarehouseAccessError("Acceso revocado", 403)
    );
    const page = await renderPage(warehouseId);
    expect(page.type).toBe(StockWarehouseNotice);
    expect(page.props.message).toBe("Acceso revocado");
  });

  it("does not disguise unexpected database failures as user-access problems", async () => {
    mocks.warehouses.mockRejectedValue(new Error("database unavailable"));
    await expect(renderPage(warehouseId)).rejects.toThrow(
      "database unavailable"
    );
  });
});

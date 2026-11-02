import { beforeEach, describe, expect, it, vi } from "vitest";
import StockPage from "@/app/org/[orgSlug]/stock/page";
import { StockProductsTable } from "@/app/org/[orgSlug]/stock/stock-table";
import { StockTableError } from "@/components/stock/stock-table-error";
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
vi.mock("@/components/stock/stock-metrics-panel", () => ({
  StockMetricsPanel: () => null,
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

const renderTable = () =>
  StockProductsTable({
    orgSlug: "org",
    params: { page: 3, pageSize: 20, search: "shoe", warehouseId },
    searchParams: { deposito: warehouseId, search: "shoe", page: "3" },
    categories: [],
    suppliers: [],
    viewOnly: false,
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
    const page = await renderTable();
    expect(page.type).toBe(StockWarehouseNotice);
    expect(page.props.message).toBe("Acceso revocado");
  });

  it("does not disguise unexpected database failures as user-access problems", async () => {
    mocks.warehouses.mockRejectedValue(new Error("database unavailable"));
    await expect(renderPage(warehouseId)).rejects.toThrow(
      "database unavailable"
    );
  });

  it("renders stock without awaiting the global metrics query", async () => {
    mocks.warehouses.mockResolvedValue([
      { id: warehouseId, name: "Principal", is_active: true },
    ]);
    mocks.metrics.mockRejectedValue(new Error("metrics timeout"));
    const page = await renderPage(warehouseId);
    expect(page.type).not.toBe(StockWarehouseNotice);
    expect(mocks.stock).not.toHaveBeenCalled();
    expect(mocks.metrics).not.toHaveBeenCalled();
  });

  it("handles a table timeout locally without turning it into empty stock or a page failure", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(vi.fn());
    mocks.stock.mockRejectedValue(new Error("statement timeout"));
    expect((await renderTable()).type).toBe(StockTableError);
    expect(mocks.metrics).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("keeps table pagination and search in the streamed table query only", async () => {
    mocks.stock.mockResolvedValue({ data: [], totalCount: 55 });
    const table = await renderTable();
    expect(table.props.pageCount).toBe(3);
    expect(mocks.stock).toHaveBeenCalledWith("org", {
      page: 3,
      pageSize: 20,
      search: "shoe",
      warehouseId,
    });
    expect(mocks.metrics).not.toHaveBeenCalled();
  });
});

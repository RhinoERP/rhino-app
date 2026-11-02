import { beforeEach, describe, expect, it, vi } from "vitest";
import { getWarehouseStockBreakdown } from "./warehouse-stock-report.service";

const mocks = vi.hoisted(() => ({
  organization: vi.fn(),
  warehouses: vi.fn(),
  from: vi.fn(),
  lotsRange: vi.fn(),
  lotsScope: vi.fn(),
  lotsOrganization: vi.fn(),
  lotsOrder: vi.fn(),
  productsOrganization: vi.fn(),
  productsIn: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: mocks.from }),
}));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: mocks.organization,
}));
vi.mock("./warehouse-stock.service", () => ({
  getAvailableWarehouses: mocks.warehouses,
}));

const warehouse = {
  id: "warehouse-a",
  name: "Principal",
  is_active: true,
  is_default: true,
};
const lot = {
  warehouse_id: warehouse.id,
  product_id: "product-a",
  quantity_available: 2,
  unit_quantity_available: null,
};

describe("consultas del reporte de stock por depósito", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.organization.mockResolvedValue({ id: "org-a" });
    mocks.warehouses.mockResolvedValue([warehouse]);
    mocks.lotsRange.mockResolvedValue({ data: [lot], error: null });
    mocks.productsIn.mockImplementation((_column: string, ids: string[]) =>
      Promise.resolve({
        data: ids.map((id) => ({
          id,
          unit_of_measure: "UN",
          tracks_stock_units: false,
        })),
        error: null,
      })
    );
    mocks.lotsScope.mockReturnThis();
    mocks.lotsOrganization.mockReturnThis();
    mocks.lotsOrder.mockReturnThis();
    mocks.productsOrganization.mockReturnThis();
    mocks.from.mockImplementation((table: string) => {
      if (table === "product_lots") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: mocks.lotsOrganization,
          in: mocks.lotsScope,
          order: mocks.lotsOrder,
          range: mocks.lotsRange,
        };
      }
      if (table === "products") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: mocks.productsOrganization,
          in: mocks.productsIn,
        };
      }
      throw new Error(`Tabla inesperada: ${table}`);
    });
  });

  it("acota lotes a la organización y depósitos accesibles, incluyendo historial inactivo", async () => {
    mocks.warehouses.mockResolvedValue([{ ...warehouse, is_active: false }]);
    const result = await getWarehouseStockBreakdown("org-slug");

    expect(mocks.warehouses).toHaveBeenCalledWith("org-slug", undefined, {
      includeInactive: true,
    });
    expect(mocks.lotsOrganization).toHaveBeenCalledWith(
      "organization_id",
      "org-a"
    );
    expect(mocks.lotsScope).toHaveBeenCalledWith("warehouse_id", [
      warehouse.id,
    ]);
    expect(mocks.productsOrganization).toHaveBeenCalledWith(
      "organization_id",
      "org-a"
    );
    expect(result).toEqual([
      expect.objectContaining({
        warehouseId: warehouse.id,
        isActive: false,
        totalUnits: 2,
      }),
    ]);
  });

  it("no consulta stock cuando no hay depósitos accesibles", async () => {
    mocks.warehouses.mockResolvedValue([]);
    await expect(getWarehouseStockBreakdown("org-slug")).resolves.toEqual([]);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("no interpreta un fallo de autorización como un reporte vacío", async () => {
    mocks.warehouses.mockRejectedValue(new Error("No autorizado"));
    await expect(getWarehouseStockBreakdown("org-slug")).rejects.toThrow(
      "No autorizado"
    );
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("suma más de una página de lotes sin duplicar productos", async () => {
    mocks.lotsRange
      .mockResolvedValueOnce({
        data: Array.from({ length: 1000 }, () => ({ ...lot })),
        error: null,
      })
      .mockResolvedValueOnce({ data: [lot], error: null });
    const result = await getWarehouseStockBreakdown("org-slug");

    expect(mocks.lotsOrder).toHaveBeenCalledWith("id");
    expect(mocks.lotsRange).toHaveBeenNthCalledWith(1, 0, 999);
    expect(mocks.lotsRange).toHaveBeenNthCalledWith(2, 1000, 1999);
    expect(mocks.productsIn).toHaveBeenCalledExactlyOnceWith("id", [
      lot.product_id,
    ]);
    expect(result[0]).toMatchObject({
      productCount: 1,
      lotCount: 1001,
      totalUnits: 2002,
    });
  });

  it("consulta catálogos grandes por bloques sin perder productos", async () => {
    const lots = Array.from({ length: 1001 }, (_, index) => ({
      ...lot,
      product_id: `product-${index}`,
    }));
    mocks.lotsRange.mockImplementation((from: number, to: number) =>
      Promise.resolve({ data: lots.slice(from, to + 1), error: null })
    );
    const result = await getWarehouseStockBreakdown("org-slug");

    expect(mocks.productsIn.mock.calls.map((call) => call[1].length)).toEqual([
      1000, 1,
    ]);
    expect(result[0]).toMatchObject({
      productCount: 1001,
      lotCount: 1001,
      totalUnits: 2002,
    });
  });

  it("conserva depósitos vacíos y evita consultar productos sin IDs", async () => {
    mocks.lotsRange.mockResolvedValue({ data: [], error: null });
    const result = await getWarehouseStockBreakdown("org-slug");
    expect(result[0]).toMatchObject({
      productCount: 0,
      lotCount: 0,
      totalUnits: 0,
    });
    expect(mocks.productsIn).not.toHaveBeenCalled();
  });

  it("rechaza el reporte si falla una página posterior de saldos", async () => {
    mocks.lotsRange
      .mockResolvedValueOnce({
        data: Array.from({ length: 1000 }, () => ({ ...lot })),
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: { message: "consulta de saldos rechazada" },
      });
    await expect(getWarehouseStockBreakdown("org-slug")).rejects.toThrow(
      "consulta de saldos rechazada"
    );
    expect(mocks.productsIn).not.toHaveBeenCalled();
  });

  it("no devuelve totales parciales si falla la lectura del catálogo", async () => {
    mocks.productsIn.mockResolvedValue({
      data: null,
      error: { message: "catálogo no disponible" },
    });
    await expect(getWarehouseStockBreakdown("org-slug")).rejects.toThrow(
      "catálogo no disponible"
    );
  });
});

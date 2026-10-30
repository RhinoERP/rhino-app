import { describe, expect, it } from "vitest";
import { buildWarehouseStockBreakdown } from "./warehouse-stock-report.service";

const warehouseA = {
  id: "warehouse-a",
  name: "Principal",
  is_active: true,
  is_default: true,
};
const warehouseB = {
  id: "warehouse-b",
  name: "Sucursal",
  is_active: true,
  is_default: false,
};
const warehouseC = {
  id: "warehouse-c",
  name: "Depósito inactivo",
  is_active: false,
  is_default: false,
};
const productUnit = {
  id: "product-unit",
  unit_of_measure: "UN",
  tracks_stock_units: false,
};
const productKg = {
  id: "product-kg",
  unit_of_measure: "KG",
  tracks_stock_units: true,
};
const productLt = {
  id: "product-lt",
  unit_of_measure: "LT",
  tracks_stock_units: true,
};

describe("stock por depósito", () => {
  it("clasifica unidades, kg y lt por depósito", () => {
    const result = buildWarehouseStockBreakdown(
      [warehouseA, warehouseB, warehouseC],
      [
        {
          warehouse_id: warehouseA.id,
          product_id: productUnit.id,
          quantity_available: 10,
          unit_quantity_available: null,
        },
        {
          warehouse_id: warehouseA.id,
          product_id: productKg.id,
          quantity_available: 5,
          unit_quantity_available: 5,
        },
        {
          warehouse_id: warehouseA.id,
          product_id: productLt.id,
          quantity_available: 2,
          unit_quantity_available: 2,
        },
        {
          warehouse_id: warehouseB.id,
          product_id: productUnit.id,
          quantity_available: 4,
          unit_quantity_available: null,
        },
      ],
      [productUnit, productKg, productLt]
    );

    expect(result).toEqual([
      {
        warehouseId: warehouseA.id,
        warehouseName: warehouseA.name,
        isActive: true,
        isDefault: true,
        productCount: 3,
        lotCount: 3,
        totalUnits: 10,
        totalKg: 5,
        totalLt: 2,
      },
      {
        warehouseId: warehouseB.id,
        warehouseName: warehouseB.name,
        isActive: true,
        isDefault: false,
        productCount: 1,
        lotCount: 1,
        totalUnits: 4,
        totalKg: 0,
        totalLt: 0,
      },
      {
        warehouseId: warehouseC.id,
        warehouseName: warehouseC.name,
        isActive: false,
        isDefault: false,
        productCount: 0,
        lotCount: 0,
        totalUnits: 0,
        totalKg: 0,
        totalLt: 0,
      },
    ]);
  });

  it("ignora lotes sin stock o productos inexistentes", () => {
    const result = buildWarehouseStockBreakdown(
      [warehouseA],
      [
        {
          warehouse_id: warehouseA.id,
          product_id: productUnit.id,
          quantity_available: 0,
          unit_quantity_available: 0,
        },
        {
          warehouse_id: warehouseA.id,
          product_id: "product-missing",
          quantity_available: 3,
          unit_quantity_available: null,
        },
      ],
      [productUnit]
    );

    expect(result[0]).toMatchObject({
      productCount: 0,
      lotCount: 0,
      totalUnits: 0,
    });
  });

  it("no duplica el total al sumar depósitos", () => {
    const result = buildWarehouseStockBreakdown(
      [warehouseA, warehouseB],
      [
        {
          warehouse_id: warehouseA.id,
          product_id: productUnit.id,
          quantity_available: 6,
          unit_quantity_available: null,
        },
        {
          warehouse_id: warehouseB.id,
          product_id: productUnit.id,
          quantity_available: 4,
          unit_quantity_available: null,
        },
      ],
      [productUnit]
    );

    expect(result.reduce((total, row) => total + row.totalUnits, 0)).toBe(10);
  });
});

import { describe, expect, it, vi } from "vitest";
import { planSaleReturnStockForItem } from "./sale-return.service";

vi.mock("server-only", () => ({}));

function lot(id: string, variant: string | null) {
  return {
    id,
    product_id: "product",
    product_variant_id: variant,
    warehouse_id: "original",
    quantity_available: 0,
    unit_quantity_available: 0,
    lot_number: "DEFAULT",
    expiration_date: null,
  };
}

describe("plan físico de devolución mayorista", () => {
  it("devuelve variantes enteras sin duplicar el primer lote entre líneas", () => {
    const lotsById = new Map([
      ["a", lot("a", "red")],
      ["b", lot("b", "red")],
    ]);
    const outbounds = [
      { lot_id: "a", quantity: 1, unit_quantity: null },
      { lot_id: "b", quantity: 1, unit_quantity: null },
    ];
    const context = {
      lotsById,
      outbounds,
      returnId: "return",
      restockReason: "Devolución",
    };
    const first = planSaleReturnStockForItem({
      ...context,
      item: {
        salesOrderItemId: "line-a",
        productId: "product",
        productVariantId: "red",
        quantity: 1,
        unitPrice: 10,
      },
    });
    const second = planSaleReturnStockForItem({
      ...context,
      item: {
        salesOrderItemId: "line-b",
        productId: "product",
        productVariantId: "red",
        quantity: 1,
        unitPrice: 10,
      },
    });
    expect(first.map((row) => [row.sourceLotId, row.quantity])).toEqual([
      ["a", 1],
    ]);
    expect(second.map((row) => [row.sourceLotId, row.quantity])).toEqual([
      ["b", 1],
    ]);
  });

  it("conserva kg fraccionados y piezas explícitas, sin redondearlos a cero", () => {
    const entries = planSaleReturnStockForItem({
      lotsById: new Map([
        ["a", lot("a", null)],
        ["b", lot("b", null)],
      ]),
      outbounds: [
        { lot_id: "a", quantity: 1000, unit_quantity: -2 },
        { lot_id: "b", quantity: 1000, unit_quantity: -2 },
      ],
      returnId: "return",
      restockReason: "Devolución",
      item: {
        salesOrderItemId: "line",
        productId: "product",
        quantity: 0.3,
        unitQuantity: 0.1,
        unitPrice: 10,
      },
    });
    expect(entries.reduce((sum, row) => sum + row.quantity, 0)).toBeCloseTo(
      0.3
    );
    expect(
      entries.reduce((sum, row) => sum + (row.unitQuantity ?? 0), 0)
    ).toBeCloseTo(0.1);
    expect(entries.every((row) => row.quantity > 0)).toBe(true);
  });

  it("reparte devoluciones CAJA entre lotes usando unidades enteras", () => {
    const entries = planSaleReturnStockForItem({
      lotsById: new Map([
        ["a", lot("a", null)],
        ["b", lot("b", null)],
      ]),
      outbounds: [
        { lot_id: "a", quantity: 30, unit_quantity: null },
        { lot_id: "b", quantity: 47, unit_quantity: null },
      ],
      returnId: "return",
      restockReason: "Devolución",
      item: {
        salesOrderItemId: "line-case",
        productId: "product",
        quantity: 12,
        unitPrice: 16_900,
        unitOfMeasure: "CAJA",
      },
    });

    expect(entries.map((row) => row.quantity)).toEqual([5, 7]);
    expect(entries.every((row) => Number.isSafeInteger(row.quantity))).toBe(
      true
    );
    expect(entries.reduce((sum, row) => sum + row.quantity, 0)).toBe(12);
  });

  it("rechaza fracciones al planificar el reingreso de una CAJA", () => {
    expect(() =>
      planSaleReturnStockForItem({
        lotsById: new Map([["a", lot("a", null)]]),
        outbounds: [{ lot_id: "a", quantity: 77, unit_quantity: null }],
        returnId: "return",
        restockReason: "Devolución",
        item: {
          salesOrderItemId: "line-case",
          productId: "product",
          quantity: 1.5,
          unitPrice: 16_900,
          unitOfMeasure: "CAJA",
        },
      })
    ).toThrow("unidades enteras");
  });

  it("no usa lotes de otro talle/color aunque tengan más stock de salida", () => {
    const entries = planSaleReturnStockForItem({
      lotsById: new Map([
        ["blue", lot("blue", "blue")],
        ["red", lot("red", "red")],
      ]),
      outbounds: [
        { lot_id: "blue", quantity: 8, unit_quantity: null },
        { lot_id: "red", quantity: 3, unit_quantity: null },
      ],
      returnId: "return",
      restockReason: "Devolución",
      item: {
        salesOrderItemId: "line",
        productId: "product",
        productVariantId: "red",
        quantity: 1,
        unitPrice: 10,
      },
    });
    expect(entries.map((row) => row.sourceLotId)).toEqual(["red"]);
  });

  it("rechaza más reingreso que la cantidad pendiente de origen", () => {
    expect(() =>
      planSaleReturnStockForItem({
        lotsById: new Map([["a", lot("a", null)]]),
        outbounds: [{ lot_id: "a", quantity: 0.1, unit_quantity: null }],
        returnId: "return",
        restockReason: "Devolución",
        item: {
          salesOrderItemId: "line",
          productId: "product",
          quantity: 0.3,
          unitPrice: 10,
        },
      })
    ).toThrow("supera el saldo pendiente");
  });
});

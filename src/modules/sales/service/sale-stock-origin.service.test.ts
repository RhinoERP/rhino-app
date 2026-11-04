import { describe, expect, it } from "vitest";
import { getOutstandingStockBySource } from "./sale-stock-origin.service";

describe("saldo pendiente de reingreso por origen", () => {
  it("descuenta del origen un reingreso hecho en otro depósito", () => {
    const result = getOutstandingStockBySource(
      [{ lot_id: "original", quantity: 10, unit_quantity: -4 }],
      [
        {
          lot_id: "principal-copy",
          reentry_source_lot_id: "original",
          quantity: 3,
          unit_quantity: 1,
        },
      ]
    );
    expect(result.get("original")).toEqual({ quantity: 7, unitQuantity: 3 });
    expect(result.has("principal-copy")).toBe(false);
  });

  it("conserva lectura de reingresos históricos sin inventar vínculos", () => {
    const result = getOutstandingStockBySource(
      [{ lot_id: "original", quantity: 5, unit_quantity: null }],
      [
        {
          lot_id: "original",
          reentry_source_lot_id: null,
          quantity: 2,
          unit_quantity: null,
        },
      ]
    );
    expect(result.get("original")).toEqual({ quantity: 3, unitQuantity: null });
  });

  it("suma ciclos de egreso y resta devoluciones antes de cancelar", () => {
    const result = getOutstandingStockBySource(
      [
        { lot_id: "original", quantity: 5, unit_quantity: null },
        { lot_id: "original", quantity: 4, unit_quantity: null },
      ],
      [
        {
          lot_id: "original",
          reentry_source_lot_id: "original",
          quantity: 5,
          unit_quantity: null,
        },
        {
          lot_id: "principal-copy",
          reentry_source_lot_id: "original",
          quantity: 1,
          unit_quantity: null,
        },
      ]
    );
    expect(result.get("original")?.quantity).toBe(3);
  });
});

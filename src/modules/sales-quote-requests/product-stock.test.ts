import { describe, expect, it } from "vitest";
import { quoteProductStockLabel } from "./product-stock";

describe("quote product stock label", () => {
  it("identifies snapshot stock as reference rather than live availability", () => {
    expect(
      quoteProductStockLabel(
        {
          totalQuantity: 8,
          totalUnitQuantity: null,
          unitOfMeasure: "UN",
          tracksStockUnits: false,
          unitsPerBox: null,
        },
        true
      )
    ).toBe("Stock del snapshot: 8 UN");
  });

  it("does not turn unknown stock into zero", () => {
    expect(
      quoteProductStockLabel(
        {
          totalQuantity: null,
          totalUnitQuantity: null,
          unitOfMeasure: "UN",
          tracksStockUnits: false,
          unitsPerBox: null,
        },
        false
      )
    ).toBe("Stock al cargar: no informado");
  });

  it("shows full boxes, loose units and the stored individual-unit count", () => {
    expect(
      quoteProductStockLabel(
        {
          totalQuantity: 8,
          totalUnitQuantity: null,
          unitOfMeasure: "CAJA",
          unitsPerBox: 6,
          tracksStockUnits: false,
        },
        true
      )
    ).toBe(
      "Stock del snapshot: 1 caja y 2 unidades sueltas · 8 unidades totales"
    );
  });
});

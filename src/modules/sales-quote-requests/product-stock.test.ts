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
        },
        false
      )
    ).toBe("Stock al cargar: no informado");
  });
});

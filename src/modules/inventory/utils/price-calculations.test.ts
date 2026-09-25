import { describe, expect, it } from "vitest";
import { calculateSalePriceFromCostAndMargin } from "./price-calculations";

describe("calculateSalePriceFromCostAndMargin", () => {
  it("returns sale price equal to cost when margin is 0%", () => {
    const costPrice = 100.0;
    const profitMargin = 0;

    const salePrice = calculateSalePriceFromCostAndMargin(
      costPrice,
      profitMargin
    );

    expect(salePrice).toBe(100.0);
  });
});

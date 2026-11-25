import { describe, expect, it } from "vitest";
import {
  calculateMarginFromCostAndPrice,
  calculateSalePriceFromCostAndMargin,
  formatMarginForEdit,
} from "./price-calculations";

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

  it("rebuilds an exact price of 50,000 from a cost of 47,000", () => {
    const margin = calculateMarginFromCostAndPrice(47_000, 50_000);

    expect(margin).toBe(6.382_978_723_4);
    expect(calculateSalePriceFromCostAndMargin(47_000, margin)).toBe(50_000);
    expect(formatMarginForEdit(margin, 47_000)).toBe("6.38298");
    expect(calculateSalePriceFromCostAndMargin(48_000, margin)).toBe(51_063.83);
  });

  it("does not expose floating point noise in the margin input", () => {
    expect(formatMarginForEdit(6.382_893_617_021_275, 47_000)).toBe("6.3829");
  });
});

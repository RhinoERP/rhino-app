import { describe, expect, it } from "vitest";
import { calculateCompetitivePriceSuggestion } from "./competitive-pricing";

describe("calculateCompetitivePriceSuggestion", () => {
  it("derives a per-product discount to match a lower competitor price", () => {
    expect(calculateCompetitivePriceSuggestion(1000, 900)).toEqual({
      baseUnitPrice: 1000,
      competitorUnitPrice: 900,
      agreedUnitPrice: 900,
      discountAmount: 100,
      discountPercentage: 10,
      priceIncreaseAmount: 0,
      adjustmentType: "DISCOUNT",
    });
  });

  it("uses a price override when competitor price is above the baseline", () => {
    expect(calculateCompetitivePriceSuggestion(1000, 1100)).toEqual({
      baseUnitPrice: 1000,
      competitorUnitPrice: 1100,
      agreedUnitPrice: 1100,
      discountAmount: 0,
      discountPercentage: 0,
      priceIncreaseAmount: 100,
      adjustmentType: "PRICE_OVERRIDE",
    });
  });

  it("does not record an adjustment when prices match", () => {
    expect(calculateCompetitivePriceSuggestion(1000, 1000)).toMatchObject({
      agreedUnitPrice: 1000,
      discountPercentage: 0,
      priceIncreaseAmount: 0,
      adjustmentType: "NONE",
    });
  });

  it("handles a zero baseline without creating an invalid discount", () => {
    expect(calculateCompetitivePriceSuggestion(0, 500)).toMatchObject({
      agreedUnitPrice: 500,
      discountPercentage: 0,
      adjustmentType: "PRICE_OVERRIDE",
    });
  });

  it("rejects negative or non-finite prices", () => {
    expect(() => calculateCompetitivePriceSuggestion(-1, 10)).toThrow();
    expect(() => calculateCompetitivePriceSuggestion(10, Number.NaN)).toThrow();
  });
});

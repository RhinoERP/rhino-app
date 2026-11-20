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

  it("keeps the list price when competitor price is above the baseline", () => {
    expect(calculateCompetitivePriceSuggestion(1000, 1100)).toEqual({
      baseUnitPrice: 1000,
      competitorUnitPrice: 1100,
      agreedUnitPrice: 1000,
      discountAmount: 0,
      discountPercentage: 0,
      priceIncreaseAmount: 0,
      adjustmentType: "NONE",
    });
  });

  it("allows a seller-selected agreed price and calculates its adjustment", () => {
    expect(calculateCompetitivePriceSuggestion(1000, 900, 950)).toEqual({
      baseUnitPrice: 1000,
      competitorUnitPrice: 900,
      agreedUnitPrice: 950,
      discountAmount: 50,
      discountPercentage: 5,
      priceIncreaseAmount: 0,
      adjustmentType: "DISCOUNT",
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
      agreedUnitPrice: 0,
      discountPercentage: 0,
      adjustmentType: "NONE",
    });
  });

  it("rejects negative or non-finite prices", () => {
    expect(() => calculateCompetitivePriceSuggestion(-1, 10)).toThrow();
    expect(() => calculateCompetitivePriceSuggestion(10, Number.NaN)).toThrow();
  });
});

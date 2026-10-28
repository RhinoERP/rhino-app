import { truncateMoney, truncateToDecimals } from "@/lib/decimal";

export type CompetitivePriceAdjustmentType =
  | "NONE"
  | "DISCOUNT"
  | "PRICE_OVERRIDE";

export type CompetitivePriceSuggestion = {
  baseUnitPrice: number;
  competitorUnitPrice: number;
  agreedUnitPrice: number;
  discountAmount: number;
  discountPercentage: number;
  priceIncreaseAmount: number;
  adjustmentType: CompetitivePriceAdjustmentType;
};

/**
 * Suggests the competitor's price as the agreed price while retaining the
 * catalog/list price as the baseline. Increases are price overrides, never
 * negative discounts.
 */
export function calculateCompetitivePriceSuggestion(
  baseUnitPrice: number,
  competitorUnitPrice: number
): CompetitivePriceSuggestion {
  if (
    !(Number.isFinite(baseUnitPrice) && Number.isFinite(competitorUnitPrice)) ||
    baseUnitPrice < 0 ||
    competitorUnitPrice < 0
  ) {
    throw new Error(
      "Los precios deben ser números válidos mayores o iguales a cero"
    );
  }

  const base = truncateMoney(baseUnitPrice);
  const competitor = truncateMoney(competitorUnitPrice);
  const isDiscount = competitor < base;
  const isIncrease = competitor > base;
  let adjustmentType: CompetitivePriceAdjustmentType = "NONE";
  if (isDiscount) {
    adjustmentType = "DISCOUNT";
  } else if (isIncrease) {
    adjustmentType = "PRICE_OVERRIDE";
  }

  return {
    baseUnitPrice: base,
    competitorUnitPrice: competitor,
    agreedUnitPrice: competitor,
    discountAmount: isDiscount ? truncateMoney(base - competitor) : 0,
    discountPercentage:
      isDiscount && base > 0
        ? truncateToDecimals(((base - competitor) / base) * 100, 6)
        : 0,
    priceIncreaseAmount: isIncrease ? truncateMoney(competitor - base) : 0,
    adjustmentType,
  };
}

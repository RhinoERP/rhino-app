import { truncateMoney, truncateToDecimals } from "@/lib/decimal";

export type CompetitivePriceAdjustmentType =
  | "NONE"
  | "DISCOUNT"
  | "PRICE_OVERRIDE";

export type SalesQuotePricingMethod =
  | "COMPETITOR"
  | "PERCENTAGE"
  | "LIST_PRICE";

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
 * Suggests matching the competitor when they are cheaper than our list price.
 * When the competitor is more expensive, keep our own list price as the
 * suggestion. A seller-selected agreed price can override that default.
 */
export function calculateCompetitivePriceSuggestion(
  baseUnitPrice: number,
  competitorUnitPrice: number,
  selectedAgreedUnitPrice?: number
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
  if (
    selectedAgreedUnitPrice != null &&
    (!Number.isFinite(selectedAgreedUnitPrice) || selectedAgreedUnitPrice < 0)
  ) {
    throw new Error(
      "El precio acordado debe ser un número válido mayor o igual a cero"
    );
  }

  const agreed = truncateMoney(
    selectedAgreedUnitPrice ?? Math.min(base, competitor)
  );
  const isDiscount = agreed < base;
  const isIncrease = agreed > base;
  let adjustmentType: CompetitivePriceAdjustmentType = "NONE";
  if (isDiscount) {
    adjustmentType = "DISCOUNT";
  } else if (isIncrease) {
    adjustmentType = "PRICE_OVERRIDE";
  }

  return {
    baseUnitPrice: base,
    competitorUnitPrice: competitor,
    agreedUnitPrice: agreed,
    discountAmount: isDiscount ? truncateMoney(base - agreed) : 0,
    discountPercentage:
      isDiscount && base > 0
        ? truncateToDecimals(((base - agreed) / base) * 100, 6)
        : 0,
    priceIncreaseAmount: isIncrease ? truncateMoney(agreed - base) : 0,
    adjustmentType,
  };
}

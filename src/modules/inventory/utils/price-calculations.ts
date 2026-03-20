const roundToTwoDecimals = (value: number) => Math.round(value * 100) / 100;

export function calculateSalePriceFromCostAndMargin(
  costPrice: number | null,
  profitMargin: number | null
): number | null {
  if (costPrice == null || profitMargin == null) {
    return null;
  }

  return roundToTwoDecimals(costPrice * (1 + profitMargin / 100));
}

const roundToTwoDecimals = (value: number) => Math.round(value * 100) / 100;

export const MARGIN_DECIMALS = 10;

export function roundMargin(value: number): number {
  return Number(value.toFixed(MARGIN_DECIMALS));
}

export function calculateMarginFromCostAndPrice(
  costPrice: number,
  salePrice: number
): number {
  return roundMargin((salePrice / costPrice - 1) * 100);
}

export function calculateSalePriceFromCostAndMargin(
  costPrice: number | null,
  profitMargin: number | null
): number | null {
  if (costPrice == null || profitMargin == null) {
    return null;
  }

  return roundToTwoDecimals(costPrice * (1 + profitMargin / 100));
}

/** Show only the decimals needed to reproduce the current price in cents. */
export function formatMarginForEdit(
  margin: number,
  costPrice?: number | null
): string {
  if (costPrice != null && costPrice > 0) {
    const currentPrice = calculateSalePriceFromCostAndMargin(costPrice, margin);
    for (let decimals = 0; decimals <= MARGIN_DECIMALS; decimals++) {
      const candidate = Number(margin.toFixed(decimals));
      if (
        calculateSalePriceFromCostAndMargin(costPrice, candidate) ===
        currentPrice
      ) {
        return String(candidate);
      }
    }
  }

  return String(roundMargin(margin));
}

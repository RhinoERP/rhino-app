/** Physical pieces are a separate measure, never a substitute for kg/liters. */
export function getStockMeasureTotals(
  quantity: number,
  unitOfMeasure: string | null | undefined
): { units: number; kg: number; lt: number } {
  if (unitOfMeasure === "KG") {
    return { units: 0, kg: quantity, lt: 0 };
  }
  if (unitOfMeasure === "LT") {
    return { units: 0, kg: 0, lt: quantity };
  }
  return { units: quantity, kg: 0, lt: 0 };
}

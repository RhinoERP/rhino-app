/**
 * Prioritizes the static weightPerUnit field from the product definition.
 * Falls back to calculated average only if weightPerUnit is not set.
 *
 * @param options - Object with all required fields
 * @returns The weight/volume per unit, or null if not applicable
 */
type ComputeAverageQuantityPerUnitOptions = {
  unitOfMeasure: string;
  tracksStockUnits: boolean;
  weightPerUnit: number | null | undefined;
  totalUnits: number | null;
  totalQuantity: number | null;
};

export function computeAverageQuantityPerUnit({
  unitOfMeasure,
  tracksStockUnits,
  weightPerUnit,
  totalUnits,
  totalQuantity,
}: ComputeAverageQuantityPerUnitOptions): number | null {
  const isWeightOrVolume = unitOfMeasure === "KG" || unitOfMeasure === "LT";

  if (!(tracksStockUnits && isWeightOrVolume)) {
    return null;
  }

  // PRIORITY 1: Use static weightPerUnit from product definition
  if (
    weightPerUnit !== null &&
    weightPerUnit !== undefined &&
    weightPerUnit > 0
  ) {
    return weightPerUnit;
  }

  // PRIORITY 2: Calculate average if possible
  if (
    totalUnits !== null &&
    totalUnits > 0 &&
    totalQuantity !== null &&
    totalQuantity > 0
  ) {
    return totalQuantity / totalUnits;
  }

  return null;
}

export function isMeasuredUnit(unitOfMeasure?: string | null): boolean {
  const unit = unitOfMeasure?.toUpperCase();
  return unit === "KG" || unit === "LT" || unit === "MT";
}

export function getPurchaseUnitShortLabel(
  unitOfMeasure?: string | null
): string {
  switch (unitOfMeasure?.toUpperCase()) {
    case "KG":
      return "kg";
    case "LT":
      return "lt";
    case "MT":
      return "m";
    case "CAJA":
      return "caja";
    default:
      return "un";
  }
}

export function getPurchaseUnitFullLabel(unitOfMeasure: string): string {
  switch (unitOfMeasure.toUpperCase()) {
    case "UN":
      return "Unidad";
    case "KG":
      return "Kg";
    case "LT":
      return "Lt";
    case "MT":
      return "Metro";
    case "CAJA":
      return "Caja";
    default:
      return unitOfMeasure;
  }
}

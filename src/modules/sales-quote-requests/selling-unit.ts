export type QuoteSellingUnit = "UNIDADES" | "CAJAS";

/** A box price/quantity is based only on the configured product units per box. */
export function quoteSellingUnitFactor(
  product: { unitOfMeasure: string; unitsPerBox?: number | null },
  sellingUnit: QuoteSellingUnit = "UNIDADES"
) {
  if (sellingUnit === "UNIDADES") {
    return 1;
  }
  if (
    product.unitOfMeasure !== "UN" ||
    !Number.isInteger(product.unitsPerBox) ||
    (product.unitsPerBox ?? 0) <= 0
  ) {
    throw new Error("Este producto no tiene unidades por caja configuradas");
  }
  return product.unitsPerBox as number;
}

export function quoteUnitSnapshot(
  product: { unitOfMeasure: string; unitsPerBox?: number | null },
  sellingUnit: QuoteSellingUnit = "UNIDADES"
) {
  const factor = quoteSellingUnitFactor(product, sellingUnit);
  return sellingUnit === "CAJAS"
    ? `CAJAS (${factor} UN por caja)`
    : product.unitOfMeasure;
}

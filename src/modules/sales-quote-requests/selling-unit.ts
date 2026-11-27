import {
  formatCaseUnitQuantity,
  getPricePerIndividualUnit,
} from "@/modules/inventory/utils/case-units";

export type QuoteSellingUnit = "UNIDADES" | "CAJAS";

const CASE_QUOTE_SNAPSHOT_PATTERN = /^UNIDADES \((\d+) UN por caja\)$/;

export function isValidCaseQuoteQuantity(
  product: { unitOfMeasure: string },
  sellingUnit: QuoteSellingUnit | undefined,
  quantity: number
): boolean {
  return (
    product.unitOfMeasure !== "CAJA" ||
    (sellingUnit === "UNIDADES" &&
      Number.isSafeInteger(quantity) &&
      quantity > 0)
  );
}

/** A box price/quantity is based only on the configured product units per box. */
export function quoteSellingUnitFactor(
  product: { unitOfMeasure: string; unitsPerBox?: number | null },
  sellingUnit: QuoteSellingUnit = "UNIDADES"
) {
  if (sellingUnit === "UNIDADES") {
    return product.unitOfMeasure === "CAJA"
      ? getPricePerIndividualUnit(1, product.unitsPerBox ?? 0)
      : 1;
  }
  if (product.unitOfMeasure === "CAJA") {
    throw new Error("Las cajas se cotizan y guardan en unidades individuales");
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
  if (product.unitOfMeasure === "CAJA") {
    return `UNIDADES (${product.unitsPerBox} UN por caja)`;
  }
  return sellingUnit === "CAJAS"
    ? `CAJAS (${factor} UN por caja)`
    : product.unitOfMeasure;
}

/** Read the immutable packaging factor from a saved quote, not today's catalog. */
export function formatQuoteUnitQuantity(
  quantity: number,
  unitSnapshot: string | null
): string {
  const caseSnapshot = CASE_QUOTE_SNAPSHOT_PATTERN.exec(unitSnapshot ?? "");
  if (caseSnapshot && Number.isSafeInteger(quantity) && quantity >= 0) {
    const unitsPerBox = Number(caseSnapshot[1]);
    if (Number.isSafeInteger(unitsPerBox) && unitsPerBox > 0) {
      return formatCaseUnitQuantity(quantity, unitsPerBox);
    }
  }
  return `${quantity.toLocaleString("es-AR")} ${unitSnapshot ?? ""}`.trim();
}

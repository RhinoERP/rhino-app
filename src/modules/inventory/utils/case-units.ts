export type CaseUnitQuantity = {
  boxes: number;
  units: number;
};

function assertUnitsPerBox(unitsPerBox: number): void {
  if (!Number.isSafeInteger(unitsPerBox) || unitsPerBox <= 0) {
    throw new Error("Las unidades por caja deben ser un entero mayor que 0");
  }
}

function assertWholeNonNegativeQuantity(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} debe ser un entero mayor o igual a 0`);
  }
}

/** Convert box and loose-unit inputs into the canonical individual-unit count. */
export function normalizeCaseUnitQuantity(
  quantity: CaseUnitQuantity,
  unitsPerBox: number
): number {
  assertUnitsPerBox(unitsPerBox);
  assertWholeNonNegativeQuantity(quantity.boxes, "La cantidad de cajas");
  assertWholeNonNegativeQuantity(quantity.units, "La cantidad de unidades");

  const total = quantity.boxes * unitsPerBox + quantity.units;
  assertWholeNonNegativeQuantity(total, "La cantidad total");
  return total;
}

/** Validate incomplete form inputs without throwing from an input/Enter event. */
export function tryNormalizeCaseUnitQuantity(
  quantity: CaseUnitQuantity,
  unitsPerBox: number | null | undefined
): number | null {
  try {
    return normalizeCaseUnitQuantity(quantity, unitsPerBox ?? 0);
  } catch {
    return null;
  }
}

/** Display a canonical individual-unit count as full boxes plus a remainder. */
export function splitCaseUnitQuantity(
  totalUnits: number,
  unitsPerBox: number
): CaseUnitQuantity {
  assertUnitsPerBox(unitsPerBox);
  assertWholeNonNegativeQuantity(totalUnits, "La cantidad total");

  return {
    boxes: Math.floor(totalUnits / unitsPerBox),
    units: totalUnits % unitsPerBox,
  };
}

/** Convert a box price to the proportional price for one individual unit. */
export function getPricePerIndividualUnit(
  pricePerBox: number,
  unitsPerBox: number
): number {
  assertUnitsPerBox(unitsPerBox);
  if (!Number.isFinite(pricePerBox) || pricePerBox < 0) {
    throw new Error("El precio por caja debe ser un importe válido");
  }

  return pricePerBox / unitsPerBox;
}

/** Catalog prices are commercial prices; transactional quantities use base units. */
export function getBaseUnitPrice(
  price: number,
  unitOfMeasure: string | null | undefined,
  unitsPerBox: number | null | undefined
): number {
  return unitOfMeasure === "CAJA"
    ? getPricePerIndividualUnit(price, unitsPerBox ?? 0)
    : price;
}

export function formatCaseUnitQuantity(
  totalUnits: number,
  unitsPerBox: number
): string {
  const { boxes, units } = splitCaseUnitQuantity(totalUnits, unitsPerBox);
  return `${boxes.toLocaleString("es-AR")} ${boxes === 1 ? "caja" : "cajas"} + ${units.toLocaleString("es-AR")} ${units === 1 ? "unidad" : "unidades"}`;
}

export type QuantitySummaryItem = {
  productId: string;
  name: string;
  quantity: number;
  unitOfMeasure?: string | null;
  unitsPerBox?: number | null;
};

/** Loose units from different SKUs never form a box together. */
export function summarizeCaseQuantities(items: QuantitySummaryItem[]) {
  const cases = new Map<string, QuantitySummaryItem>();
  let otherUnits = 0;
  let hasOtherProducts = false;
  for (const item of items) {
    if (item.unitOfMeasure !== "CAJA" || !item.unitsPerBox) {
      otherUnits += item.quantity;
      hasOtherProducts = true;
      continue;
    }
    const key = `${item.productId}:${item.unitsPerBox}`;
    const current = cases.get(key);
    cases.set(key, {
      ...item,
      quantity: (current?.quantity ?? 0) + item.quantity,
    });
  }
  return { cases: [...cases.values()], otherUnits, hasOtherProducts };
}

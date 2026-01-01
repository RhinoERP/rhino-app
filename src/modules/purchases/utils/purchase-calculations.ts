import type { ProductWithPrice } from "../service/purchases.service";

export type InputUnit = "PALLETS" | "BOXES" | "UNITS";

/**
 * Converts quantity from a specific unit to base units.
 * @param quantity The quantity to convert
 * @param unit The unit type (PALLETS, BOXES, or UNITS)
 * @param product The product with conversion factors
 * @returns The quantity in base units
 */
export const convertToBaseUnits = (
  quantity: number,
  unit: InputUnit,
  product: ProductWithPrice
): number => {
  if (unit === "UNITS") {
    return quantity;
  }

  if (unit === "BOXES") {
    const unitsPerBox = product.units_per_box;
    if (!unitsPerBox || unitsPerBox <= 0) {
      return quantity;
    }
    return quantity * unitsPerBox;
  }

  if (unit === "PALLETS") {
    const boxesPerPallet = product.boxes_per_pallet;
    const unitsPerBox = product.units_per_box;
    if (!boxesPerPallet || boxesPerPallet <= 0) {
      return quantity;
    }
    if (!unitsPerBox || unitsPerBox <= 0) {
      return quantity * boxesPerPallet;
    }
    return quantity * boxesPerPallet * unitsPerBox;
  }

  return quantity;
};

/**
 * Gets the available input units for a product based on its configuration.
 * @param product The product to check
 * @returns Array of available input units
 */
export const getAvailableUnits = (
  product: ProductWithPrice | undefined
): InputUnit[] => {
  if (!product) {
    return ["UNITS"];
  }

  const units: InputUnit[] = ["UNITS"];

  if (product.units_per_box && product.units_per_box > 0) {
    units.push("BOXES");
  }

  if (product.boxes_per_pallet && product.boxes_per_pallet > 0) {
    units.push("PALLETS");
  }

  return units;
};

/**
 * Gets the display label for an input unit.
 * @param unit The input unit
 * @returns The localized label
 */
export const getUnitLabel = (unit: InputUnit): string => {
  switch (unit) {
    case "PALLETS":
      return "Pallets";
    case "BOXES":
      return "Cajas";
    case "UNITS":
      return "Unidades";
    default:
      return "Unidades";
  }
};

/**
 * Calculates the price per kilogram for weight-based products.
 * @param unitOfMeasure The unit of measure for the product
 * @param costPrice The cost price of the product
 * @returns The price per kg if applicable, undefined otherwise
 */
export const getPricePerKg = (
  unitOfMeasure: string | null | undefined,
  costPrice: number | null | undefined
): number | undefined => {
  if (unitOfMeasure === "KG" && costPrice != null) {
    return costPrice;
  }
  return;
};

/**
 * Calculates the subtotal for a purchase item considering weight, quantity, and discounts.
 * @param params Calculation parameters
 * @returns The calculated subtotal
 */
export const calculateSubtotal = (params: {
  totalWeight: number | null;
  pricePerKg: number | undefined;
  quantity: number;
  unitCost: number;
  discountPercent?: number;
}): number => {
  const {
    totalWeight,
    pricePerKg,
    quantity,
    unitCost,
    discountPercent = 0,
  } = params;
  let gross: number;
  if (totalWeight && pricePerKg) {
    gross = totalWeight * pricePerKg;
  } else {
    gross = quantity * unitCost;
  }

  const discount = Math.min(
    Math.max(0, (discountPercent / 100) * gross),
    Math.max(0, gross)
  );

  return Math.max(0, gross - discount);
};

/**
 * Calculates purchase summary totals including taxes and discounts.
 * @param subtotal The subtotal before taxes and discounts
 * @param taxRates Array of tax rates to apply
 * @param globalDiscountPercent Global discount percentage (0-100)
 * @returns Object containing tax details and total
 */
export const calculatePurchaseTotals = (
  subtotal: number,
  taxRates: Array<{ id: string; name: string; rate: number }>,
  globalDiscountPercent = 0
) => {
  const taxDetails = taxRates.map((tax) => ({
    tax,
    amount: subtotal * (tax.rate / 100),
  }));

  const totalTaxAmount = taxDetails.reduce(
    (sum, detail) => sum + detail.amount,
    0
  );

  const discountAmount = Math.min(
    Math.max(0, (globalDiscountPercent / 100) * subtotal),
    Math.max(0, subtotal)
  );

  const preDiscountTotal = subtotal + totalTaxAmount;
  const total = Math.max(0, preDiscountTotal - discountAmount);

  return {
    taxDetails,
    totalTaxAmount,
    discountAmount,
    preDiscountTotal,
    total,
  };
};

/**
 * Gets the modifier key based on the platform (⌘ for Mac, Ctrl for others).
 * @returns The modifier key string
 */
export const getModifierKey = (): string => {
  if (typeof window !== "undefined") {
    return navigator.platform.toUpperCase().indexOf("MAC") >= 0 ? "⌘" : "Ctrl";
  }
  return "Ctrl";
};

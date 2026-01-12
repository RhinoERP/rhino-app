import type { SaleProduct } from "../types";

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
  product: SaleProduct
): number => {
  if (unit === "UNITS") {
    return quantity;
  }

  if (unit === "BOXES") {
    const unitsPerBox = product.unitsPerBox;
    if (!unitsPerBox || unitsPerBox <= 0) {
      return quantity;
    }
    return quantity * unitsPerBox;
  }

  if (unit === "PALLETS") {
    const boxesPerPallet = product.boxesPerPallet;
    const unitsPerBox = product.unitsPerBox;
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
  product: SaleProduct | undefined
): InputUnit[] => {
  if (!product) {
    return ["UNITS"];
  }

  const units: InputUnit[] = ["UNITS"];

  if (product.unitsPerBox && product.unitsPerBox > 0) {
    units.push("BOXES");
  }

  if (product.boxesPerPallet && product.boxesPerPallet > 0) {
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
 * @param salePrice The sale price of the product
 * @returns The price per kg if applicable, undefined otherwise
 */
export const getPricePerKg = (
  unitOfMeasure: string | null | undefined,
  salePrice: number | null | undefined
): number | undefined => {
  if (unitOfMeasure === "KG" && salePrice != null) {
    return salePrice;
  }
  return;
};

/**
 * Calculates the subtotal for a sale item considering weight, quantity, and discounts.
 * @param params Calculation parameters
 * @returns The calculated subtotal
 */
export const calculateSubtotal = (params: {
  totalWeight: number | null;
  pricePerKg: number | undefined;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
}): number => {
  const {
    totalWeight,
    pricePerKg,
    quantity,
    unitPrice,
    discountPercent = 0,
  } = params;
  let gross: number;
  if (totalWeight && pricePerKg) {
    gross = totalWeight * pricePerKg;
  } else {
    gross = quantity * unitPrice;
  }

  const discount = Math.min(
    Math.max(0, (discountPercent / 100) * gross),
    Math.max(0, gross)
  );

  return Math.max(0, gross - discount);
};

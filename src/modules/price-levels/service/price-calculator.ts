import { truncateMoney } from "@/lib/decimal";
import type { SalesPriceListType } from "@/modules/sales-price-lists/types";
import type { PriceLevel } from "../types";

/**
 * Ajuste de lista de venta (lista especial / repurposed sales_price_lists).
 * Solo PERCENTAGE y PRICE; el margen objetivo vive ahora en price_levels.
 */
export type SalePriceAdjustment = {
  type: SalesPriceListType;
  value: number;
};

/**
 * Resultado del cálculo de precio: el precio efectivo y el margen aplicado
 * (margen del nivel o del producto) para snapshot en la venta / comisiones.
 */
export type SalePriceCalculation = {
  price: number;
  margin: number | null;
  priceLevelId: string | null;
};

type CalculateSalePriceParams = {
  /** Precio base del producto (calculated_sale_price = costo × (1 + profit_margin)). */
  basePrice: number;
  /** Costo del producto (para nivel de margen). Puede faltar. */
  costPrice?: number | null;
  /** Nivel de lista seleccionado (lista 35/45/55). Null = lista base. */
  level?: PriceLevel | null;
  /** Ajustes (listas especiales) aplicados sobre el precio efectivo. */
  adjustments?: SalePriceAdjustment[];
};

/**
 * Motor unificado de cálculo de precio de venta.
 *
 * Jerarquía:
 *   nivel seleccionado  → precio = costo × (1 + nivel.margin/100)
 *   sin nivel           → precio = basePrice (lista base, margen del producto)
 *   luego               → se aplican los ajustes (PERCENTAGE / PRICE) sobre el precio efectivo
 */
export function calculateSalePrice({
  basePrice,
  costPrice,
  level,
  adjustments = [],
}: CalculateSalePriceParams): SalePriceCalculation {
  const effectiveCost = costPrice ?? null;
  const hasLevel = Boolean(level && effectiveCost != null && effectiveCost > 0);

  let price: number;
  let margin: number | null;

  if (hasLevel && level && effectiveCost != null) {
    price = truncateMoney(effectiveCost * (1 + level.margin / 100));
    margin = level.margin;
  } else {
    price = basePrice;
    margin = null;
  }

  for (const adjustment of adjustments) {
    if (adjustment.type === "PRICE") {
      price = truncateMoney(Math.max(0, price + adjustment.value));
    } else {
      price = truncateMoney(price * (1 + adjustment.value / 100));
    }
  }

  return {
    price,
    margin,
    priceLevelId: hasLevel && level ? level.id : null,
  };
}

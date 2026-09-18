import { truncateMoney } from "@/lib/decimal";
import type { PriceListItemBasic } from "@/modules/price-lists/service/price-lists.service";
import type { SalesPriceListType } from "@/modules/sales-price-lists/types";
import type { SaleProduct } from "../types";

export type PriceListAssignment = {
  type: SalesPriceListType;
  value: number;
};

export function applyPriceListAssignment(
  basePrice: number,
  assignment: PriceListAssignment | null
): number {
  if (!assignment) {
    return basePrice;
  }

  if (assignment.type === "PRICE") {
    return truncateMoney(Math.max(0, basePrice + assignment.value));
  }

  return truncateMoney(basePrice * (1 + assignment.value / 100));
}

export function buildProductPriceMap(
  products: SaleProduct[],
  supplierPriceMap: Map<string, PriceListAssignment>,
  supplierPriceListItems: Map<string, Map<string, PriceListItemBasic>>,
  fallback: PriceListAssignment | null
): Map<string, number> {
  const priceMap = new Map<string, number>();

  for (const product of products) {
    let basePrice = product.price;
    if (product.supplierId != null) {
      const item = supplierPriceListItems
        .get(product.supplierId)
        ?.get(product.id);
      if (item) {
        basePrice =
          item.margin != null
            ? truncateMoney(item.costPrice * (1 + item.margin / 100))
            : item.costPrice;
      }
    }

    const assignment =
      product.supplierId != null && supplierPriceMap.has(product.supplierId)
        ? (supplierPriceMap.get(product.supplierId) as PriceListAssignment)
        : fallback;

    priceMap.set(product.id, applyPriceListAssignment(basePrice, assignment));
  }

  return priceMap;
}

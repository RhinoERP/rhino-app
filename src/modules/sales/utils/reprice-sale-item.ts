import { getBaseUnitPrice } from "@/modules/inventory/utils/case-units";

type PricedSaleItem = {
  type: string;
  unitOfMeasure: string;
  unitsPerBox?: number | null;
  unitPrice: number;
  basePrice: number;
  pricePerKg?: number;
};

/** Price maps contain commercial prices; sale lines always price base units. */
export function repriceSaleItem<T extends PricedSaleItem>(
  item: T,
  commercialPrice: number
): T {
  if (item.type !== "product") {
    return item;
  }
  const unitPrice = getBaseUnitPrice(
    commercialPrice,
    item.unitOfMeasure,
    item.unitsPerBox
  );
  if (item.unitPrice === unitPrice) {
    return item;
  }
  const measured = ["KG", "LT", "MT"].includes(item.unitOfMeasure);
  return {
    ...item,
    unitPrice,
    basePrice:
      measured || item.unitOfMeasure === "CAJA" ? unitPrice : item.basePrice,
    pricePerKg: measured ? unitPrice : item.pricePerKg,
  };
}

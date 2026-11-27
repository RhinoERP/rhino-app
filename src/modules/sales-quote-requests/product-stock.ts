import { formatCaseUnitQuantity } from "@/modules/inventory/utils/case-units";
import type { SaleProduct } from "@/modules/sales/types";

export function quoteProductStockLabel(
  product: Pick<
    SaleProduct,
    | "totalQuantity"
    | "totalUnitQuantity"
    | "unitOfMeasure"
    | "tracksStockUnits"
    | "unitsPerBox"
  >,
  offline: boolean
) {
  const prefix = offline ? "Stock del snapshot" : "Stock al cargar";
  if (product.totalQuantity === null) {
    return `${prefix}: no informado`;
  }
  const format = (value: number) =>
    new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(value);
  if (product.unitOfMeasure === "CAJA" && product.unitsPerBox) {
    return `${prefix}: ${formatCaseUnitQuantity(product.totalQuantity, product.unitsPerBox)}`;
  }
  const quantity = `${format(product.totalQuantity)} ${product.unitOfMeasure}`;
  if (product.tracksStockUnits && product.totalUnitQuantity !== null) {
    return `${prefix}: ${format(product.totalUnitQuantity)} un. · ${quantity}`;
  }
  return `${prefix}: ${quantity}`;
}

import type { WorkSheet } from "xlsx";
import {
  HABITUAL_DISCOUNT_FIELDS,
  type PurchaseDiscountMethod,
  validateHabitualDiscounts,
} from "@/modules/purchases/utils/purchase-discounts";
import type { ImportPriceListItem } from "../types";

const SKU_COLUMN = /^sku$/i;
const PRICE_COLUMN = /^(precio|price)$/i;
const CURRENCY_COLUMN = /^(moneda|currency)$/i;
const PERCENT_SUFFIX = /%$/;
const DISCOUNT_COLUMN = /^descuento[ _]*[1-5](?:\s*%)?$/i;
const CELL_COLUMN = /^[A-Z]+/;
const EXCEL_LITERAL_FORMAT_PARTS = /"(?:[^"]|"")*"|\\.|_.|\*.|\[[^\]]*\]/g;

function hasPercentageOperator(format: unknown): boolean {
  return (
    typeof format === "string" &&
    format.replace(EXCEL_LITERAL_FORMAT_PARTS, "").includes("%")
  );
}

/** Excel stores a formatted 10% as 0.1. Plain numeric 10 remains 10%. */
export function normalizePriceListDiscountCells(sheet: WorkSheet): void {
  const columns = new Set(
    Object.entries(sheet)
      .filter(
        ([address, cell]) =>
          CELL_COLUMN.test(address) &&
          typeof cell?.v === "string" &&
          DISCOUNT_COLUMN.test(cell.v.trim())
      )
      .map(([address]) => address.match(CELL_COLUMN)?.[0])
  );
  for (const [address, cell] of Object.entries(sheet)) {
    if (
      columns.has(address.match(CELL_COLUMN)?.[0]) &&
      typeof cell?.v === "number" &&
      hasPercentageOperator(cell.z)
    ) {
      cell.v *= 100;
    }
  }
}

function readDiscount(value: unknown): number {
  return value == null || value === ""
    ? 0
    : Number(
        String(value).replace(PERCENT_SUFFIX, "").replace(",", ".").trim()
      );
}

function applyRowDiscounts(
  row: Record<string, unknown>,
  item: ImportPriceListItem,
  method: PurchaseDiscountMethod
) {
  for (const [index, field] of HABITUAL_DISCOUNT_FIELDS.entries()) {
    const pattern = new RegExp(`^descuento[ _]*${index + 1}(?:\\s*%)?$`, "i");
    const key = Object.keys(row).find((name) => pattern.test(name.trim()));
    item[field] = readDiscount(key ? row[key] : null);
  }
  try {
    validateHabitualDiscounts(item, method);
  } catch (error) {
    throw new Error(
      `SKU ${item.sku}: ${error instanceof Error ? error.message : "Descuentos inválidos"}`
    );
  }
}

export function parsePriceListRow(
  row: Record<string, unknown>,
  method?: PurchaseDiscountMethod
): ImportPriceListItem | null {
  const find = (pattern: RegExp) =>
    Object.keys(row).find((key) => pattern.test(key.trim()));
  const skuKey = find(SKU_COLUMN);
  const priceKey = find(PRICE_COLUMN);
  if (!(skuKey && priceKey)) {
    return null;
  }
  const sku = String(row[skuKey] ?? "").trim();
  if (String(row[priceKey] ?? "").trim() === "") {
    return null;
  }
  const price = Number(row[priceKey]);
  if (!method && price <= 0) {
    return null;
  }
  if (!(sku && Number.isFinite(price)) || price < 0) {
    return null;
  }
  const currencyKey = find(CURRENCY_COLUMN);
  const item: ImportPriceListItem = {
    sku,
    price,
    currency:
      currencyKey && String(row[currencyKey]).trim().toUpperCase() === "USD"
        ? "USD"
        : "ARS",
  };
  if (method) {
    applyRowDiscounts(row, item, method);
  }
  return item;
}

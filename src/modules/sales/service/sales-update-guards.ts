import type { UpdateSaleOrderInput } from "../types";

const AUTHORIZED_SALE_FISCAL_FIELDS: Array<keyof UpdateSaleOrderInput> = [
  "customerId",
  "sellerId",
  "saleDate",
  "expirationDate",
  "creditDays",
  "invoiceType",
  "invoiceNumber",
  "globalDiscountPercentage",
  "items",
  "taxes",
];

export function getAuthorizedSaleFiscalUpdateFields(
  input: UpdateSaleOrderInput
): string[] {
  return AUTHORIZED_SALE_FISCAL_FIELDS.filter(
    (field) => input[field] !== undefined
  );
}

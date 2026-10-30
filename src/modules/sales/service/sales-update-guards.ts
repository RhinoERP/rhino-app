import type { UpdateSaleOrderInput } from "../types";

const AUTHORIZED_SALE_FISCAL_FIELDS: Array<keyof UpdateSaleOrderInput> = [
  "customerId",
  "sellerId",
  "saleDate",
  "expirationDate",
  "creditDays",
  "invoiceType",
  "invoiceNumber",
  "commercialExchangeRate",
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

export function shouldUpdateSaleWarehouse(params: {
  status: string;
  currentWarehouseId: string | null;
  requestedWarehouseId: string | undefined;
}): params is {
  status: "DRAFT";
  currentWarehouseId: string | null;
  requestedWarehouseId: string;
} {
  const { status, currentWarehouseId, requestedWarehouseId } = params;
  if (!requestedWarehouseId || requestedWarehouseId === currentWarehouseId) {
    return false;
  }
  if (status !== "DRAFT") {
    throw new Error(
      "Solo se puede cambiar el depósito de una preventa en borrador"
    );
  }
  return true;
}

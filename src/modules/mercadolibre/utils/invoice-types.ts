import { normalizeCustomerTaxCondition } from "@/modules/customers/tax-conditions";
import type { ValidatedMeliSale } from "../types";

export function meliInvoiceTypesForIssuer(
  issuerCondition: string | null | undefined
): ValidatedMeliSale["invoiceType"][] {
  const condition = normalizeCustomerTaxCondition(issuerCondition);
  if (condition === "RESPONSABLE_INSCRIPTO") {
    return ["FACTURA_A", "FACTURA_B"];
  }
  if (condition === "MONOTRIBUTO" || condition === "EXENTO") {
    return ["FACTURA_C"];
  }
  return [];
}

export function defaultMeliInvoiceType(
  types: ValidatedMeliSale["invoiceType"][],
  receiverCondition: string
): ValidatedMeliSale["invoiceType"] {
  if (types.includes("FACTURA_C")) {
    return "FACTURA_C";
  }
  return receiverCondition === "RESPONSABLE_INSCRIPTO"
    ? "FACTURA_A"
    : "FACTURA_B";
}

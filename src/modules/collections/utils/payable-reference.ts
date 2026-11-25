import { z } from "zod";
import type { PayableAccount } from "../types";

const invoiceOrdersSchema = z.array(
  z.object({ id: z.string().uuid(), purchase_number: z.number().nullable() })
);

export function parsePayableInvoiceOrders(
  value: unknown
): NonNullable<PayableAccount["purchaseOrders"]> {
  return invoiceOrdersSchema.parse(value);
}

export function formatPayableReference(
  account: Pick<
    PayableAccount,
    "purchase_order_id" | "supplier_invoice_id" | "invoice" | "purchase"
  >
): string {
  if (account.invoice) {
    return [
      account.invoice.invoice_type,
      account.invoice.point_of_sale,
      account.invoice.invoice_number,
    ]
      .filter(Boolean)
      .join("-");
  }
  if (account.supplier_invoice_id) {
    return `Factura ${account.supplier_invoice_id.slice(0, 8)}`;
  }
  if (account.purchase?.purchase_number != null) {
    return `OC-${String(account.purchase.purchase_number).padStart(4, "0")}`;
  }
  return account.purchase_order_id
    ? `OC ${account.purchase_order_id.slice(0, 8)}`
    : "Deuda sin OC";
}

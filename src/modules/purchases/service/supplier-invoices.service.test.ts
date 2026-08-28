import { describe, expect, it } from "vitest";
import { createSupplierInvoiceSchema } from "./supplier-invoices.service";

const validInvoice = {
  orgSlug: "demo",
  supplierId: "893f202a-4d4f-4a1f-b556-3f5be74cbf55",
  purchaseOrderId: null,
  invoiceType: "A",
  pointOfSale: null,
  invoiceNumber: "00000001",
  invoiceDate: "2026-08-28",
  dueDate: null,
  subtotalAmount: 100,
  taxAmount: 21,
  totalAmount: 121,
  notes: null,
};

describe("createSupplierInvoiceSchema", () => {
  it("accepts totals calculated from two-decimal amounts", () => {
    const result = createSupplierInvoiceSchema.safeParse({
      ...validInvoice,
      subtotalAmount: 100.1,
      taxAmount: 21.02,
      totalAmount: 121.12,
    });

    expect(result.success).toBe(true);
  });

  it("rejects values with more than two decimal places", () => {
    const result = createSupplierInvoiceSchema.safeParse({
      ...validInvoice,
      subtotalAmount: 10.999,
      totalAmount: 11,
    });

    expect(result.success).toBe(false);
  });

  it("rejects totals that do not equal subtotal plus taxes", () => {
    const result = createSupplierInvoiceSchema.safeParse({
      ...validInvoice,
      totalAmount: 120.99,
    });

    expect(result.success).toBe(false);
  });
});

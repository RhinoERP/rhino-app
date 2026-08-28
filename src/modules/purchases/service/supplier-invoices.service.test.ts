import { describe, expect, it } from "vitest";
import { buildFacturaCompra } from "@/lib/accounting-client";
import {
  createSupplierInvoiceSchema,
  formatSupplierInvoiceReference,
} from "./supplier-invoices.service";

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

describe("formatSupplierInvoiceReference", () => {
  it("joins type, point of sale and number with dashes", () => {
    expect(
      formatSupplierInvoiceReference({
        invoice_type: "A",
        point_of_sale: "0001",
        invoice_number: "00000123",
      })
    ).toBe("A-0001-00000123");
  });

  it("omits null segments", () => {
    expect(
      formatSupplierInvoiceReference({
        invoice_type: "B",
        point_of_sale: null,
        invoice_number: "42",
      })
    ).toBe("B-42");
  });
});

describe("supplier invoice → buildFacturaCompra integration", () => {
  const invoice = {
    id: "si-aaa",
    organization_id: "org-bbb",
    supplier_id: "sup-ccc",
    invoice_date: "2026-08-01",
    due_date: "2026-09-01",
    subtotal_amount: 2000,
    tax_amount: 420,
    total_amount: 2420,
    invoice_type: "A" as const,
    point_of_sale: "0003",
    invoice_number: "00000007",
  };

  it("produces FACTURA_COMPRA event pointing to supplier_invoices table", () => {
    const ref = formatSupplierInvoiceReference(invoice);
    const event = buildFacturaCompra(
      {
        id: invoice.id,
        organization_id: invoice.organization_id,
        supplier_id: invoice.supplier_id,
        purchase_date: invoice.invoice_date,
        expiration_date: invoice.due_date,
        subtotal_amount: invoice.subtotal_amount,
        tax_amount: invoice.tax_amount,
        total_amount: invoice.total_amount,
        remittance_number: ref,
        taxes: null,
      },
      {},
      {
        referenciaTabla: "supplier_invoices",
        idempotencyKey: `FACTURA_COMPRA_SI_${invoice.id}`,
      }
    );

    expect(event.tipoEvento).toBe("FACTURA_COMPRA");
    expect(event.referenciaTabla).toBe("supplier_invoices");
    expect(event.referenciaId).toBe("si-aaa");
    expect(event.idempotencyKey).toBe("FACTURA_COMPRA_SI_si-aaa");
    expect(event.datos.facturaNumero).toBe("A-0003-00000007");
    expect(event.datos.condicionCompra).toBe("CREDITO");
    expect(event.datos.totalFactura).toBe("2420.0000");
    expect(event.datos.proveedorId).toBe("sup-ccc");
  });

  it("idempotency key differs from OC-based key to prevent collision", () => {
    const siKey = `FACTURA_COMPRA_SI_${invoice.id}`;
    const ocKey = `FACTURA_COMPRA_${invoice.id}`;

    expect(siKey).not.toBe(ocKey);
  });
});

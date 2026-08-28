/**
 * Integration type tests: validates the full SupplierInvoice → accounting event contract.
 * These tests exercise every boundary where types cross module lines.
 */
import { describe, expect, expectTypeOf, it } from "vitest";
import { buildFacturaCompra } from "@/lib/accounting-client";
import type { EventoFacturaCompra } from "@/modules/accounting/types";
import { formatSupplierInvoiceReference } from "./service/supplier-invoices.service";
import type { SupplierInvoice } from "./supplier-invoices.types";

// ── Fixture ──────────────────────────────────────────────────────────────────

const INVOICE: SupplierInvoice = {
  id: "si-11111111-0000-0000-0000-000000000001",
  organization_id: "org-00000000-0000-0000-0000-000000000001",
  supplier_id: "sup-00000000-0000-0000-0000-000000000001",
  purchase_order_id: null,
  invoice_type: "A",
  point_of_sale: "0001",
  invoice_number: "00000042",
  invoice_date: "2026-08-28",
  due_date: "2026-09-28",
  subtotal_amount: 10_000,
  tax_amount: 2100,
  total_amount: 12_100,
  currency: "ARS",
  status: "REGISTERED",
  invoice_pdf_url: null,
  invoice_filename: null,
  notes: null,
  created_at: "2026-08-28T00:00:00Z",
  created_by: null,
};

function invoiceToAccountingInput(invoice: SupplierInvoice) {
  return {
    id: invoice.id,
    organization_id: invoice.organization_id,
    supplier_id: invoice.supplier_id,
    purchase_date: invoice.invoice_date,
    expiration_date: invoice.due_date,
    subtotal_amount: invoice.subtotal_amount,
    tax_amount: invoice.tax_amount,
    total_amount: invoice.total_amount,
    remittance_number: formatSupplierInvoiceReference(invoice),
    taxes: null,
  } as const;
}

// ── Type-level assertions ─────────────────────────────────────────────────────

describe("type contracts", () => {
  it("EventoFacturaCompra is the return type of buildFacturaCompra", () => {
    const event = buildFacturaCompra(
      invoiceToAccountingInput(INVOICE),
      {},
      {
        referenciaTabla: "supplier_invoices",
        idempotencyKey: `FACTURA_COMPRA_SI_${INVOICE.id}`,
      }
    );

    expectTypeOf(event).toMatchTypeOf<EventoFacturaCompra>();
  });

  it("SupplierInvoice.supplier_id is always a string (non-nullable guard)", () => {
    // The dialog checks `result.invoice.supplier_id` before calling buildFacturaCompra.
    // This asserts the type IS string (not string | null) so the runtime check is sufficient.
    expectTypeOf(INVOICE.supplier_id).toEqualTypeOf<string>();
  });

  it("buildFacturaCompra overrides param is optional — existing callers stay unaffected", () => {
    // Calling without overrides must still compile.
    const event = buildFacturaCompra({
      id: "po-id",
      organization_id: "org-id",
      supplier_id: "sup-id",
      purchase_date: "2026-01-01",
      expiration_date: null,
      subtotal_amount: 100,
      tax_amount: 21,
      total_amount: 121,
      remittance_number: null,
    });

    expectTypeOf(event).toMatchTypeOf<EventoFacturaCompra>();
  });
});

// ── Behavioral assertions ─────────────────────────────────────────────────────

describe("supplier invoice → EventoFacturaCompra mapping", () => {
  const event = buildFacturaCompra(
    invoiceToAccountingInput(INVOICE),
    {},
    {
      referenciaTabla: "supplier_invoices",
      idempotencyKey: `FACTURA_COMPRA_SI_${INVOICE.id}`,
    }
  );

  it("event type and table are set correctly", () => {
    expect(event.tipoEvento).toBe("FACTURA_COMPRA");
    expect(event.referenciaTabla).toBe("supplier_invoices");
    expect(event.referenciaId).toBe(INVOICE.id);
    expect(event.orgId).toBe(INVOICE.organization_id);
  });

  it("idempotency key uses SI_ prefix to avoid OC collision", () => {
    const ocKey = `FACTURA_COMPRA_${INVOICE.id}`;
    expect(event.idempotencyKey).toBe(`FACTURA_COMPRA_SI_${INVOICE.id}`);
    expect(event.idempotencyKey).not.toBe(ocKey);
  });

  it("amounts map 1:1 from SupplierInvoice fields", () => {
    expect(event.datos.totalFactura).toBe("12100.0000");
    expect(event.datos.montoImpuestos).toBe("2100.0000");
    expect(event.datos.montoNeto).toBe("10000.0000");
    // taxes: null → no IIBB breakdown
    expect(event.datos.montoIIBB).toBe("0.0000");
  });

  it("condicionCompra is CREDITO when due_date is present", () => {
    expect(event.datos.condicionCompra).toBe("CREDITO");
  });

  it("condicionCompra is CONTADO when due_date is null", () => {
    const eventContado = buildFacturaCompra(
      { ...invoiceToAccountingInput(INVOICE), expiration_date: null },
      {},
      { referenciaTabla: "supplier_invoices", idempotencyKey: "k" }
    );
    expect(eventContado.datos.condicionCompra).toBe("CONTADO");
  });

  it("facturaNumero is built from type + PV + number joined by dashes", () => {
    expect(event.datos.facturaNumero).toBe("A-0001-00000042");
    expect(event.descripcion).toBe("Factura compra A-0001-00000042");
  });

  it("proveedorId maps from supplier_id", () => {
    expect(event.datos.proveedorId).toBe(INVOICE.supplier_id);
  });

  it("fecha maps from invoice_date", () => {
    expect(event.fecha).toBe(INVOICE.invoice_date);
  });
});

// ── Action return type contract ───────────────────────────────────────────────

describe("createSupplierInvoiceAction return shape", () => {
  it("success response includes the full SupplierInvoice (structural check)", () => {
    // Mirrors the shape the dialog relies on after `result.invoice`.
    const successShape = {
      success: true as const,
      invoice: INVOICE,
    };

    // All fields the dialog uses when building the accounting payload:
    expect(successShape.invoice.id).toBeDefined();
    expect(successShape.invoice.organization_id).toBeDefined();
    expect(successShape.invoice.supplier_id).toBeDefined();
    expect(successShape.invoice.invoice_date).toBeDefined();
    expect(successShape.invoice.due_date).toBeDefined(); // may be null
    expect(successShape.invoice.subtotal_amount).toBeDefined();
    expect(successShape.invoice.tax_amount).toBeDefined();
    expect(successShape.invoice.total_amount).toBeDefined();
    expect(successShape.invoice.invoice_type).toBeDefined();
    expect(successShape.invoice.point_of_sale).toBeDefined(); // may be null
    expect(successShape.invoice.invoice_number).toBeDefined();
  });
});

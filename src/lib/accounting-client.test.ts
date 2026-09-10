import { describe, expect, it } from "vitest";
import {
  buildFacturaCompra,
  buildFacturaVentaManual,
  buildNcVenta,
  buildNdVenta,
  buildOrdenPago,
} from "./accounting-client";

describe("buildNdVenta", () => {
  it("construye un evento idempotente, con ingreso pendiente e impuestos separados", () => {
    const event = buildNdVenta({
      id: "00000000-0000-0000-0000-000000000015",
      organizationId: "00000000-0000-0000-0000-000000000001",
      customerId: "00000000-0000-0000-0000-000000000003",
      salesOrderId: "00000000-0000-0000-0000-000000000004",
      debitNoteNumber: "ND-0001",
      issueDate: "2026-08-01",
      amount: 1230,
      items: [
        {
          netAmount: 1000,
          taxAmount: 230,
          taxes: [
            { name: "IVA 21%", taxAmount: 210, taxCodeSnapshot: "IVA_21" },
            { name: "IIBB", taxAmount: 20, taxCodeSnapshot: "TRIBUTO_02" },
          ],
        },
      ],
    });

    expect(event).toMatchObject({
      tipoEvento: "ND_VENTA",
      referenciaTabla: "debit_notes",
      idempotencyKey: "ND_VENTA_00000000-0000-0000-0000-000000000015",
      datos: {
        totalFactura: "1230.0000",
        montoNeto: "1000.0000",
        montoImpuestos: "230.0000",
      },
    });
    expect(event.datos.lineasDesglosadas).toEqual([
      {
        accountCode: null,
        montoNeto: "1000.0000",
        montoImpuestos: "230.0000",
        impuestos: [
          {
            monto: "210.0000",
            accountCode: null,
            taxCode: "IVA_21",
            nombre: "IVA 21%",
          },
          {
            monto: "20.0000",
            accountCode: "TRIBUTOS_A_PAGAR",
            taxCode: "TRIBUTO_02",
            nombre: "IIBB",
          },
        ],
      },
    ]);
  });
});

const buildPayment = (referenceNumber?: string | null) =>
  buildOrdenPago(
    {
      id: "a882d5d1-1a17-45d6-80c3-f2b1de97dea1",
      organization_id: "organization-id",
      account_payable_id: "payable-id",
      amount: 85_000,
      payment_method: "cheque",
      payment_date: "2026-08-02",
      reference_number: referenceNumber,
    },
    {
      supplier_id: "supplier-id",
    }
  );

describe("buildOrdenPago", () => {
  it("uses the endorsed check information as the journal description", () => {
    const event = buildPayment("Cheques endosados N° 0001, 0002");

    expect(event.descripcion).toBe(
      "Orden de pago Cheques endosados N° 0001, 0002"
    );
  });

  it("does not expose the payment UUID when no reference exists", () => {
    const event = buildPayment();

    expect(event.descripcion).toBe("Orden de pago");
    expect(event.descripcion).not.toContain(event.referenciaId);
  });
});

const BASE_SUPPLIER_INVOICE = {
  id: "si-00000000-0000-0000-0000-000000000001",
  organization_id: "org-00000000-0000-0000-0000-000000000001",
  supplier_id: "sup-00000000-0000-0000-0000-000000000001",
  invoice_date: "2026-08-01",
  due_date: "2026-09-01",
  subtotal_amount: 1000,
  tax_amount: 210,
  total_amount: 1210,
  invoice_type: "A",
  point_of_sale: "0001",
  invoice_number: "00000123",
  taxes: null,
} as const;

describe("buildFacturaCompra", () => {
  it("defaults to purchase_orders table and standard idempotency key", () => {
    const event = buildFacturaCompra({
      id: "po-00000000-0000-0000-0000-000000000001",
      organization_id: "org-00000000-0000-0000-0000-000000000001",
      supplier_id: "sup-00000000-0000-0000-0000-000000000001",
      purchase_date: "2026-08-01",
      expiration_date: null,
      subtotal_amount: 1000,
      tax_amount: 210,
      total_amount: 1210,
      remittance_number: "FC-001",
    });

    expect(event.referenciaTabla).toBe("purchase_orders");
    expect(event.idempotencyKey).toBe(
      "FACTURA_COMPRA_po-00000000-0000-0000-0000-000000000001"
    );
    expect(event.tipoEvento).toBe("FACTURA_COMPRA");
  });

  it("overrides referenciaTabla and idempotencyKey for supplier_invoices", () => {
    const invoiceId = BASE_SUPPLIER_INVOICE.id;
    const event = buildFacturaCompra(
      {
        id: invoiceId,
        organization_id: BASE_SUPPLIER_INVOICE.organization_id,
        supplier_id: BASE_SUPPLIER_INVOICE.supplier_id,
        purchase_date: BASE_SUPPLIER_INVOICE.invoice_date,
        expiration_date: BASE_SUPPLIER_INVOICE.due_date,
        subtotal_amount: BASE_SUPPLIER_INVOICE.subtotal_amount,
        tax_amount: BASE_SUPPLIER_INVOICE.tax_amount,
        total_amount: BASE_SUPPLIER_INVOICE.total_amount,
        remittance_number: "A-0001-00000123",
        taxes: null,
      },
      {},
      {
        referenciaTabla: "supplier_invoices",
        idempotencyKey: `FACTURA_COMPRA_SI_${invoiceId}`,
      }
    );

    expect(event.referenciaTabla).toBe("supplier_invoices");
    expect(event.idempotencyKey).toBe(`FACTURA_COMPRA_SI_${invoiceId}`);
    expect(event.referenciaId).toBe(invoiceId);
  });

  it("maps supplier invoice amounts correctly", () => {
    const event = buildFacturaCompra(
      {
        id: BASE_SUPPLIER_INVOICE.id,
        organization_id: BASE_SUPPLIER_INVOICE.organization_id,
        supplier_id: BASE_SUPPLIER_INVOICE.supplier_id,
        purchase_date: BASE_SUPPLIER_INVOICE.invoice_date,
        expiration_date: BASE_SUPPLIER_INVOICE.due_date,
        subtotal_amount: 1000,
        tax_amount: 210,
        total_amount: 1210,
        remittance_number: "A-0001-00000123",
        taxes: null,
      },
      {},
      {
        referenciaTabla: "supplier_invoices",
        idempotencyKey: "FACTURA_COMPRA_SI_si-1",
      }
    );

    expect(event.datos.totalFactura).toBe("1210.0000");
    // montoNeto = total - IVA (no IIBB because taxes: null)
    expect(event.datos.montoImpuestos).toBe("210.0000");
    expect(event.datos.montoNeto).toBe("1000.0000");
    expect(event.datos.condicionCompra).toBe("CREDITO");
    expect(event.datos.proveedorId).toBe(BASE_SUPPLIER_INVOICE.supplier_id);
    expect(event.datos.facturaNumero).toBe("A-0001-00000123");
  });

  it("sets condicionCompra to CONTADO when due_date is null", () => {
    const event = buildFacturaCompra(
      {
        id: BASE_SUPPLIER_INVOICE.id,
        organization_id: BASE_SUPPLIER_INVOICE.organization_id,
        supplier_id: BASE_SUPPLIER_INVOICE.supplier_id,
        purchase_date: BASE_SUPPLIER_INVOICE.invoice_date,
        expiration_date: null,
        subtotal_amount: 1000,
        tax_amount: 210,
        total_amount: 1210,
        remittance_number: "A-0001-00000123",
        taxes: null,
      },
      {},
      {
        referenciaTabla: "supplier_invoices",
        idempotencyKey: "FACTURA_COMPRA_SI_si-1",
      }
    );

    expect(event.datos.condicionCompra).toBe("CONTADO");
  });

  it("builds the reference number from invoice type, point of sale and number", () => {
    const parts = [
      BASE_SUPPLIER_INVOICE.invoice_type,
      BASE_SUPPLIER_INVOICE.point_of_sale,
      BASE_SUPPLIER_INVOICE.invoice_number,
    ]
      .filter(Boolean)
      .join("-");

    const event = buildFacturaCompra(
      {
        id: BASE_SUPPLIER_INVOICE.id,
        organization_id: BASE_SUPPLIER_INVOICE.organization_id,
        supplier_id: BASE_SUPPLIER_INVOICE.supplier_id,
        purchase_date: BASE_SUPPLIER_INVOICE.invoice_date,
        expiration_date: null,
        subtotal_amount: 1000,
        tax_amount: 210,
        total_amount: 1210,
        remittance_number: parts,
        taxes: null,
      },
      {},
      {
        referenciaTabla: "supplier_invoices",
        idempotencyKey: "FACTURA_COMPRA_SI_si-1",
      }
    );

    expect(event.datos.facturaNumero).toBe("A-0001-00000123");
    expect(event.descripcion).toBe("Factura compra A-0001-00000123");
  });

  it("does not affect existing call-sites — purchase_orders defaults are unchanged", () => {
    const event = buildFacturaCompra({
      id: "po-id",
      organization_id: "org-id",
      supplier_id: "sup-id",
      purchase_date: "2026-01-01",
      expiration_date: null,
      subtotal_amount: 500,
      tax_amount: 105,
      total_amount: 605,
      remittance_number: null,
      purchase_number: 42,
    });

    expect(event.referenciaTabla).toBe("purchase_orders");
    expect(event.idempotencyKey).toBe("FACTURA_COMPRA_po-id");
    expect(event.datos.facturaNumero).toBe("Compra 42");
  });
});

describe("builders emiten moneda/tipoCambio/montoUSD cuando se pasa currency", () => {
  const CURRENCY = {
    moneda: "USD" as const,
    tipoCambio: 1240.5,
    montoUSD: 1000,
  };

  it("buildFacturaCompra incluye los campos de moneda", () => {
    const event = buildFacturaCompra(
      {
        id: "po-id",
        organization_id: "org-id",
        supplier_id: "sup-id",
        purchase_date: "2026-01-01",
        expiration_date: null,
        subtotal_amount: 500,
        tax_amount: 105,
        total_amount: 605,
        remittance_number: null,
        purchase_number: 42,
      },
      CURRENCY
    );
    expect(event.datos).toMatchObject({
      moneda: "USD",
      tipoCambio: "1240.5000",
      montoUSD: "1000.0000",
    });
  });

  it("buildFacturaVentaManual incluye los campos de moneda", () => {
    const event = buildFacturaVentaManual(
      {
        id: "sale-id",
        organization_id: "org-id",
        customer_id: "cust-id",
        sale_date: "2026-01-01",
        expiration_date: null,
        invoice_number: null,
      },
      { total: 1210, totalTaxAmount: 210 },
      { ...CURRENCY }
    );
    expect(event.datos).toMatchObject({
      moneda: "USD",
      tipoCambio: "1240.5000",
      montoUSD: "1000.0000",
    });
  });

  it("buildNcVenta incluye los campos de moneda", () => {
    const event = buildNcVenta(
      {
        id: "nc-id",
        organization_id: "org-id",
        customer_id: "cust-id",
        sales_order_id: "sale-id",
        credit_note_number: "NC-1",
        issue_date: "2026-01-01",
        amount: 500,
      },
      { id: "sale-id", total_amount: 1210, total_tax_amount: 210 },
      { ...CURRENCY }
    );
    expect(event.datos).toMatchObject({
      moneda: "USD",
      tipoCambio: "1240.5000",
      montoUSD: "1000.0000",
    });
  });

  it("buildNdVenta incluye los campos de moneda", () => {
    const event = buildNdVenta(
      {
        id: "nd-id",
        organizationId: "org-id",
        customerId: "cust-id",
        salesOrderId: "sale-id",
        debitNoteNumber: "ND-1",
        issueDate: "2026-01-01",
        amount: 500,
        items: [{ netAmount: 400, taxAmount: 100, taxes: [] }],
      },
      { ...CURRENCY }
    );
    expect(event.datos).toMatchObject({
      moneda: "USD",
      tipoCambio: "1240.5000",
      montoUSD: "1000.0000",
    });
  });

  it("no emite moneda cuando no se pasa currency", () => {
    const event = buildFacturaCompra({
      id: "po-id",
      organization_id: "org-id",
      supplier_id: "sup-id",
      purchase_date: "2026-01-01",
      expiration_date: null,
      subtotal_amount: 500,
      tax_amount: 105,
      total_amount: 605,
      remittance_number: null,
      purchase_number: 42,
    });
    expect(event.datos.moneda).toBeUndefined();
    expect(event.datos.tipoCambio).toBeUndefined();
    expect(event.datos.montoUSD).toBeUndefined();
  });
});

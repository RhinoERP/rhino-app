import { describe, expect, it } from "vitest";
import { buildNdVenta, buildOrdenPago } from "./accounting-client";

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

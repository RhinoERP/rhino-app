import { describe, expect, it } from "vitest";
import { buildNdVenta } from "./accounting-client";

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

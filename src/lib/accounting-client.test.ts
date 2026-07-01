import { describe, expect, it } from "vitest";
import { buildFacturaVentaManual } from "./accounting-client";

describe("buildFacturaVentaManual", () => {
  it("preserva las cuentas contables de los ítems desglosados", () => {
    const event = buildFacturaVentaManual(
      {
        id: "sale-12345678",
        organization_id: "org-1",
        customer_id: "customer-1",
        sale_date: "2026-06-30",
        expiration_date: null,
        invoice_number: "A-0001-00000001",
      },
      { total: 363, totalTaxAmount: 63 },
      {
        items: [
          {
            accountCode: "4.1.1.001",
            montoNeto: 100,
            montoImpuestos: 21,
          },
          {
            accountCode: "4.1.1.002",
            montoNeto: 200,
            montoImpuestos: 42,
          },
        ],
      }
    );

    expect(event.datos.lineasDesglosadas).toEqual([
      {
        accountCode: "4.1.1.001",
        montoNeto: "100.0000",
        montoImpuestos: "21.0000",
        impuestos: undefined,
      },
      {
        accountCode: "4.1.1.002",
        montoNeto: "200.0000",
        montoImpuestos: "42.0000",
        impuestos: undefined,
      },
    ]);
  });
});

import { describe, expect, it } from "vitest";
import {
  isIssuedInvoice,
  monthlySellerKpis,
  quantityKpis,
  type SaleFact,
} from "./progress";

const month = "2026-11-01";
// biome-ignore lint/nursery/useMaxParams: explicit fixture fields keep date and overrides readable in KPI scenarios
function sale(
  id: string,
  sellerId: string,
  customerId: string | null,
  date: string,
  overrides: Partial<SaleFact> = {}
): SaleFact {
  return {
    id,
    sellerId,
    customerId,
    date,
    status: "CONFIRMED",
    documentType: "STANDARD",
    amount: 100,
    invoiceType: null,
    invoiceNumber: null,
    arcaStatus: null,
    authorizedAt: null,
    ...overrides,
  };
}

describe("KPI del vendedor", () => {
  it("cuenta una única primera compra mensual por cliente y vendedor", () => {
    const result = monthlySellerKpis(
      [
        sale("a", "ana", "c", "2026-11-01"),
        sale("b", "ana", "c", "2026-11-09"),
        sale("c", "beto", "c", "2026-11-10"),
        sale("d", "ana", "viejo", "2026-07-01"),
        sale("e", "ana", "viejo", "2026-11-11"),
      ],
      month
    );
    expect(result.get("ana")?.newCustomers).toBe(1);
    expect(result.get("ana")?.sales).toBe(3);
    expect(result.get("beto")?.newCustomers).toBe(1);
  });

  it("solo factura comprobantes emitidos, en el mes de autorización, sin sumar preventas", () => {
    const result = monthlySellerKpis(
      [
        sale("a", "ana", "c", "2026-10-01", {
          invoiceType: "FACTURA_A",
          arcaStatus: "authorized",
          authorizedAt: "2026-11-01T01:00:00Z",
        }),
        sale("b", "ana", "c", "2026-10-01", {
          invoiceType: "FACTURA_A",
          arcaStatus: "authorized",
          authorizedAt: "2026-11-03T12:00:00Z",
          amount: 300,
        }),
        sale("c", "ana", "c2", "2026-11-04", {
          invoiceType: "FACTURA_B",
          invoiceNumber: "0001-0001",
          amount: 200,
        }),
        sale("d", "ana", "c3", "2026-11-05", {
          invoiceType: "FACTURA_A",
          arcaStatus: "pending",
        }),
        sale("e", "ana", "c4", "2026-11-06", {
          invoiceType: "NOTA_DE_VENTA",
          invoiceNumber: "123",
        }),
        sale("f", "ana", "c5", "2026-11-07", { status: "DRAFT" }),
      ],
      month
    );
    expect(result.get("ana")?.billing).toBe(500);
    expect(result.get("ana")?.sales).toBe(3);
    expect(
      isIssuedInvoice(
        sale("x", "ana", "c", month, {
          invoiceType: "FACTURA_A",
          invoiceNumber: " ",
        })
      )
    ).toBe(false);
  });

  it("no cuenta documentos de anticipo como ventas ni clientes nuevos", () => {
    const result = monthlySellerKpis(
      [
        sale("advance", "ana", "c", month, {
          documentType: "ADVANCE",
          invoiceType: "FACTURA_B",
          arcaStatus: "authorized",
          amount: 40,
        }),
        sale("sale", "ana", "c", "2026-11-08", { amount: 60 }),
      ],
      month
    );
    expect(result.get("ana")).toMatchObject({
      billing: 40,
      sales: 1,
      newCustomers: 1,
    });
  });

  it("separa unidades, kilogramos, litros, metros y cajas completas más unidades sueltas", () => {
    expect(
      quantityKpis({
        quantity: 20,
        unitQuantity: null,
        unitOfMeasure: "CAJA",
        unitsPerBox: 6,
      })
    ).toEqual({ units: 2, kg: 0, lt: 0, boxes: 3, meters: 0 });
    expect(
      quantityKpis({
        quantity: 2,
        unitQuantity: 7.5,
        unitOfMeasure: "KG",
        unitsPerBox: null,
      }).kg
    ).toBe(7.5);
    expect(
      quantityKpis({
        quantity: 3,
        unitQuantity: 4.25,
        unitOfMeasure: "LT",
        unitsPerBox: null,
      }).lt
    ).toBe(4.25);
    expect(
      quantityKpis({
        quantity: 5,
        unitQuantity: null,
        unitOfMeasure: "UN",
        unitsPerBox: null,
      }).units
    ).toBe(5);
    expect(
      quantityKpis({
        quantity: 2,
        unitQuantity: 8,
        unitOfMeasure: "MT",
        unitsPerBox: null,
      }).meters
    ).toBe(8);
  });
});

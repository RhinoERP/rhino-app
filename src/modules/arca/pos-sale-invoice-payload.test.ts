import { describe, expect, it } from "vitest";
import {
  buildArcaVoucherRequestFromPosSale,
  type PosArcaLoadedSale,
} from "./pos-sale-invoice-payload";

const TEST_CBTE_FCH = 20_260_519;
const CUIT_CUIL_ERROR_PATTERN = /CUIT\/CUIL/;
const FACTURA_C_ERROR_PATTERN = /Factura C/;
const FACTURA_B_IVA_ERROR_PATTERN = /Factura B requiere un impuesto IVA/;
const TAX_CODE_ERROR_PATTERN = /código fiscal ARCA/;

function buildSale(
  overrides: Partial<PosArcaLoadedSale> = {}
): PosArcaLoadedSale {
  return {
    id: "pos-sale-1",
    totalAmount: 1210,
    taxAmount: 210,
    customer: null,
    taxes: [
      {
        id: "pos-tax-1",
        taxId: "tax-1",
        name: "IVA 21%",
        rate: 21,
        baseAmount: 1000,
        taxAmount: 210,
        taxCodeSnapshot: "IVA_21",
      },
    ],
    ...overrides,
  };
}

describe("buildArcaVoucherRequestFromPosSale", () => {
  it("usa consumidor final sin identificar para Factura B bajo el umbral", () => {
    const request = buildArcaVoucherRequestFromPosSale({
      sale: buildSale(),
      invoiceType: "FACTURA_B",
      pointOfSale: 3,
      cbteFch: TEST_CBTE_FCH,
    });

    expect(request).toMatchObject({
      CbteTipo: 6,
      PtoVta: 3,
      DocTipo: 99,
      DocNro: 0,
      CondicionIVAReceptorId: 5,
      CbteFch: TEST_CBTE_FCH,
      ImpTotal: 1210,
      ImpNeto: 1000,
      ImpIVA: 210,
      ImpTrib: 0,
    });
    expect(request.Iva).toEqual([{ Id: 5, BaseImp: 1000, Importe: 210 }]);
  });

  it("rechaza consumidor final sobre el umbral si no tiene CUIT/CUIL", () => {
    expect(() =>
      buildArcaVoucherRequestFromPosSale({
        sale: buildSale({
          totalAmount: 10_000_000,
          taxAmount: 1_735_537.19,
          taxes: [
            {
              id: "pos-tax-1",
              taxId: "tax-1",
              name: "IVA 21%",
              rate: 21,
              baseAmount: 8_264_462.81,
              taxAmount: 1_735_537.19,
              taxCodeSnapshot: "IVA_21",
            },
          ],
        }),
        invoiceType: "FACTURA_B",
        pointOfSale: 3,
        cbteFch: TEST_CBTE_FCH,
      })
    ).toThrow(CUIT_CUIL_ERROR_PATTERN);
  });

  it("usa CUIT/CUIL para consumidor final sobre el umbral", () => {
    const request = buildArcaVoucherRequestFromPosSale({
      sale: buildSale({
        totalAmount: 10_000_000,
        taxAmount: 1_735_537.19,
        customer: { cuit: "20-12345678-3" },
        taxes: [
          {
            id: "pos-tax-1",
            taxId: "tax-1",
            name: "IVA 21%",
            rate: 21,
            baseAmount: 8_264_462.81,
            taxAmount: 1_735_537.19,
            taxCodeSnapshot: "IVA_21",
          },
        ],
      }),
      invoiceType: "FACTURA_B",
      pointOfSale: 3,
      cbteFch: TEST_CBTE_FCH,
    });

    expect(request.DocTipo).toBe(80);
    expect(request.DocNro).toBe(20_123_456_783);
  });

  it("rechaza Factura C con impuestos asociados", () => {
    expect(() =>
      buildArcaVoucherRequestFromPosSale({
        sale: buildSale(),
        invoiceType: "FACTURA_C",
        pointOfSale: 3,
        cbteFch: TEST_CBTE_FCH,
      })
    ).toThrow(FACTURA_C_ERROR_PATTERN);
  });

  it("rechaza Factura B sin IVA en el snapshot fiscal", () => {
    expect(() =>
      buildArcaVoucherRequestFromPosSale({
        sale: buildSale({
          totalAmount: 1000,
          taxAmount: 0,
          taxes: [],
        }),
        invoiceType: "FACTURA_B",
        pointOfSale: 3,
        cbteFch: TEST_CBTE_FCH,
      })
    ).toThrow(FACTURA_B_IVA_ERROR_PATTERN);
  });

  it("permite Factura B con IVA 0% informado en el snapshot fiscal", () => {
    const request = buildArcaVoucherRequestFromPosSale({
      sale: buildSale({
        totalAmount: 1000,
        taxAmount: 0,
        taxes: [
          {
            id: "pos-tax-1",
            taxId: "tax-1",
            name: "IVA 0%",
            rate: 0,
            baseAmount: 1000,
            taxAmount: 0,
            taxCodeSnapshot: "IVA_0",
          },
        ],
      }),
      invoiceType: "FACTURA_B",
      pointOfSale: 3,
      cbteFch: TEST_CBTE_FCH,
    });

    expect(request).toMatchObject({
      ImpTotal: 1000,
      ImpNeto: 1000,
      ImpIVA: 0,
    });
    expect(request.Iva).toEqual([{ Id: 3, BaseImp: 1000, Importe: 0 }]);
  });

  it("clasifica percepciones IIBB como tributo provincial ARCA", () => {
    const request = buildArcaVoucherRequestFromPosSale({
      sale: buildSale({
        totalAmount: 1240,
        taxAmount: 240,
        taxes: [
          {
            id: "pos-tax-1",
            taxId: "tax-1",
            name: "IVA 21%",
            rate: 21,
            baseAmount: 1000,
            taxAmount: 210,
            taxCodeSnapshot: "IVA_21",
          },
          {
            id: "pos-tax-2",
            taxId: "tax-2",
            name: "Perc IIBB",
            rate: 3,
            baseAmount: 1000,
            taxAmount: 30,
            taxCodeSnapshot: "TRIBUTO_02",
          },
        ],
      }),
      invoiceType: "FACTURA_B",
      pointOfSale: 3,
      cbteFch: TEST_CBTE_FCH,
    });

    expect(request).toMatchObject({
      ImpTotal: 1240,
      ImpNeto: 1000,
      ImpIVA: 210,
      ImpTrib: 30,
    });
    expect(request.Tributos).toEqual([
      {
        Id: 2,
        Desc: "Perc IIBB",
        BaseImp: 1000,
        Alic: 3,
        Importe: 30,
      },
    ]);
  });

  it("rechaza impuestos sin código fiscal ARCA en el snapshot", () => {
    expect(() =>
      buildArcaVoucherRequestFromPosSale({
        sale: buildSale({
          taxes: [
            {
              id: "pos-tax-1",
              taxId: "tax-1",
              name: "IVA sin código",
              rate: 21,
              baseAmount: 1000,
              taxAmount: 210,
              taxCodeSnapshot: null,
            },
          ],
        }),
        invoiceType: "FACTURA_B",
        pointOfSale: 3,
        cbteFch: TEST_CBTE_FCH,
      })
    ).toThrow(TAX_CODE_ERROR_PATTERN);
  });
});

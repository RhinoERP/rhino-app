import { describe, expect, it } from "vitest";
import {
  type ArcaCreditNoteLoadedSale,
  buildArcaCreditNoteVoucherRequest,
  buildArcaDebitNoteVoucherRequest,
  mapInvoiceTypeToArcaDebitNoteVoucherType,
} from "./credit-note-invoice-payload";

const TEST_CBTE_FCH = 20_260_610;
const TEST_ASSOCIATED_CBTE_FCH = 20_260_601;
const UNSUPPORTED_INVOICE_TYPE_ERROR_PATTERN = /no está soportado/;

function buildSale(
  overrides: Partial<ArcaCreditNoteLoadedSale> = {}
): ArcaCreditNoteLoadedSale {
  return {
    id: "sale-1",
    saleDate: "2026-06-01",
    invoiceType: "FACTURA_A",
    totalAmount: 1210,
    arcaPointOfSale: 3,
    arcaVoucherNumber: 42,
    arcaVoucherTypeCode: 1,
    customer: {
      cuit: "20-12345678-3",
      taxCondition: "RESPONSABLE_INSCRIPTO",
    },
    taxes: [
      {
        id: "tax-1",
        taxId: "tax-config-1",
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

describe("buildArcaCreditNoteVoucherRequest", () => {
  it("mapea Factura A a Nota de Crédito A y asocia el comprobante original", () => {
    const request = buildArcaCreditNoteVoucherRequest({
      creditNote: {
        id: "credit-note-1",
        amount: 1210,
        invoiceType: "FACTURA_A",
      },
      sale: buildSale(),
      pointOfSale: 5,
      cbteFch: TEST_CBTE_FCH,
      associatedVoucherDate: TEST_ASSOCIATED_CBTE_FCH,
    });

    expect(request).toMatchObject({
      CbteTipo: 3,
      PtoVta: 5,
      CbteFch: TEST_CBTE_FCH,
      ImpTotal: 1210,
      ImpNeto: 1000,
      ImpIVA: 210,
      ImpTrib: 0,
      CbtesAsoc: [
        {
          Tipo: 1,
          PtoVta: 3,
          Nro: 42,
          CbteFch: TEST_ASSOCIATED_CBTE_FCH,
        },
      ],
    });
    expect(request.Iva).toEqual([{ Id: 5, BaseImp: 1000, Importe: 210 }]);
  });

  it("mapea Factura B a Nota de Crédito B", () => {
    const request = buildArcaCreditNoteVoucherRequest({
      creditNote: {
        id: "credit-note-1",
        amount: 1210,
        invoiceType: "FACTURA_B",
      },
      sale: buildSale({
        invoiceType: "FACTURA_B",
        arcaVoucherTypeCode: 6,
        customer: {
          cuit: "20-12345678-3",
          taxCondition: "MONOTRIBUTO",
        },
      }),
      pointOfSale: 5,
      cbteFch: TEST_CBTE_FCH,
      associatedVoucherDate: TEST_ASSOCIATED_CBTE_FCH,
    });

    expect(request.CbteTipo).toBe(8);
  });

  it("mantiene moneda, cotización y cancelación USD de la factura asociada", () => {
    const request = buildArcaCreditNoteVoucherRequest({
      creditNote: {
        id: "credit-note-usd",
        amount: 1210,
        invoiceType: "FACTURA_A",
      },
      sale: buildSale({
        arcaRequestJson: {
          fiscalCurrency: {
            code: "DOL",
            rate: 1234.56,
            sameCurrencySettlement: true,
          },
        },
      }),
      pointOfSale: 5,
      cbteFch: TEST_CBTE_FCH,
      associatedVoucherDate: TEST_ASSOCIATED_CBTE_FCH,
    });

    expect(request).toMatchObject({
      MonId: "DOL",
      MonCotiz: 1234.56,
      CanMisMonExt: "S",
    });
    expect(
      buildArcaDebitNoteVoucherRequest({
        creditNote: {
          id: "debit-note-usd",
          amount: 1210,
          invoiceType: "FACTURA_A",
        },
        sale: buildSale({
          arcaRequestJson: {
            fiscalCurrency: {
              code: "DOL",
              rate: 1234.56,
              sameCurrencySettlement: true,
            },
          },
        }),
        pointOfSale: 5,
        cbteFch: TEST_CBTE_FCH,
        associatedVoucherDate: TEST_ASSOCIATED_CBTE_FCH,
      })
    ).toMatchObject({ MonId: "DOL", MonCotiz: 1234.56, CanMisMonExt: "S" });
  });

  it("mapea Factura C a Nota de Crédito C", () => {
    const request = buildArcaCreditNoteVoucherRequest({
      creditNote: {
        id: "credit-note-1",
        amount: 500,
        invoiceType: "FACTURA_C",
      },
      sale: buildSale({
        invoiceType: "FACTURA_C",
        totalAmount: 500,
        arcaVoucherTypeCode: 11,
        customer: {
          cuit: "20-12345678-3",
          taxCondition: "MONOTRIBUTO",
        },
        taxes: [],
      }),
      pointOfSale: 5,
      cbteFch: TEST_CBTE_FCH,
      associatedVoucherDate: TEST_ASSOCIATED_CBTE_FCH,
    });

    expect(request).toMatchObject({
      CbteTipo: 13,
      ImpTotal: 500,
      ImpNeto: 500,
      ImpIVA: 0,
      ImpTrib: 0,
    });
    expect(request.Iva).toBeUndefined();
  });

  it("mapea Factura A con retención a NC tipo 53 y asocia el comprobante tipo 51", () => {
    const request = buildArcaCreditNoteVoucherRequest({
      creditNote: {
        id: "credit-note-1",
        amount: 1210,
        invoiceType: "FACTURA_A_RETENCION",
      },
      sale: buildSale({
        invoiceType: "FACTURA_A_RETENCION",
        arcaVoucherTypeCode: 51,
      }),
      pointOfSale: 5,
      cbteFch: TEST_CBTE_FCH,
      associatedVoucherDate: TEST_ASSOCIATED_CBTE_FCH,
    });

    expect(request).toMatchObject({
      CbteTipo: 53,
      CbtesAsoc: [
        {
          Tipo: 51,
          PtoVta: 3,
          Nro: 42,
          CbteFch: TEST_ASSOCIATED_CBTE_FCH,
        },
      ],
    });
  });

  it("prorratea importes fiscales para una NC parcial de Factura A con retención", () => {
    const request = buildArcaCreditNoteVoucherRequest({
      creditNote: {
        id: "credit-note-1",
        amount: 605,
        invoiceType: "FACTURA_A_RETENCION",
      },
      sale: buildSale({
        invoiceType: "FACTURA_A_RETENCION",
        arcaVoucherTypeCode: 51,
      }),
      pointOfSale: 5,
      cbteFch: TEST_CBTE_FCH,
      associatedVoucherDate: TEST_ASSOCIATED_CBTE_FCH,
    });

    expect(request).toMatchObject({
      ImpTotal: 605,
      ImpNeto: 500,
      ImpIVA: 105,
      ImpTrib: 0,
    });
    expect(request.Iva).toEqual([{ Id: 5, BaseImp: 500, Importe: 105 }]);
  });

  it("mantiene el rechazo para tipos de comprobante no soportados", () => {
    expect(() =>
      buildArcaCreditNoteVoucherRequest({
        creditNote: {
          id: "credit-note-1",
          amount: 1210,
          invoiceType: "FACTURA_E",
        },
        sale: buildSale({
          invoiceType: "FACTURA_E",
        }),
        pointOfSale: 5,
      })
    ).toThrow(UNSUPPORTED_INVOICE_TYPE_ERROR_PATTERN);
  });

  it("usa impuestos propios de la nota de crédito cuando existen", () => {
    const request = buildArcaCreditNoteVoucherRequest({
      creditNote: {
        id: "credit-note-1",
        amount: 242,
        invoiceType: "FACTURA_A",
        taxes: [
          {
            id: "credit-tax-1",
            taxId: "tax-config-1",
            name: "IVA 21%",
            rate: 21,
            baseAmount: 200,
            taxAmount: 42,
            taxCodeSnapshot: "IVA_21",
          },
        ],
      },
      sale: buildSale(),
      pointOfSale: 5,
      cbteFch: TEST_CBTE_FCH,
      associatedVoucherDate: TEST_ASSOCIATED_CBTE_FCH,
    });

    expect(request).toMatchObject({
      ImpTotal: 242,
      ImpNeto: 200,
      ImpIVA: 42,
      ImpTrib: 0,
    });
    expect(request.Iva).toEqual([{ Id: 5, BaseImp: 200, Importe: 42 }]);
  });

  it("asocia múltiples comprobantes cuando la NC tiene facturas fuente", () => {
    const request = buildArcaCreditNoteVoucherRequest({
      creditNote: {
        id: "credit-note-1",
        amount: 242,
        invoiceType: "FACTURA_A",
        taxes: [
          {
            id: "credit-tax-1",
            taxId: "tax-config-1",
            name: "IVA 21%",
            rate: 21,
            baseAmount: 200,
            taxAmount: 42,
            taxCodeSnapshot: "IVA_21",
          },
        ],
        sourceDocuments: [
          {
            id: "source-1",
            salesOrderId: "sale-1",
            appliedAmount: 121,
            invoiceType: "FACTURA_A",
            invoiceNumber: "0003-00000042",
            arcaStatus: "authorized",
            arcaPointOfSale: 3,
            arcaVoucherNumber: 42,
            arcaVoucherTypeCode: 1,
            arcaVoucherDate: "2026-06-01",
          },
          {
            id: "source-2",
            salesOrderId: "sale-2",
            appliedAmount: 121,
            invoiceType: "FACTURA_A",
            invoiceNumber: "0003-00000043",
            arcaStatus: "authorized",
            arcaPointOfSale: 3,
            arcaVoucherNumber: 43,
            arcaVoucherTypeCode: 1,
            arcaVoucherDate: "2026-06-02",
          },
        ],
      },
      sale: buildSale(),
      pointOfSale: 5,
      cbteFch: TEST_CBTE_FCH,
    });

    expect(request.CbtesAsoc).toEqual([
      { Tipo: 1, PtoVta: 3, Nro: 42, CbteFch: 20_260_601 },
      { Tipo: 1, PtoVta: 3, Nro: 43, CbteFch: 20_260_602 },
    ]);
  });

  it("usa la fecha fiscal de la factura original si está en el request ARCA persistido", () => {
    const request = buildArcaCreditNoteVoucherRequest({
      creditNote: {
        id: "credit-note-1",
        amount: 1210,
        invoiceType: "FACTURA_A",
      },
      sale: buildSale({
        arcaRequestJson: {
          wsfeRequest: {
            CbteFch: TEST_ASSOCIATED_CBTE_FCH,
          },
        },
      }),
      pointOfSale: 5,
      cbteFch: TEST_CBTE_FCH,
    });

    expect(request.CbtesAsoc[0]?.CbteFch).toBe(TEST_ASSOCIATED_CBTE_FCH);
  });
});

describe("buildArcaDebitNoteVoucherRequest", () => {
  it("mapea Factura A, B, C y A con retención a los comprobantes de débito ARCA", () => {
    expect(mapInvoiceTypeToArcaDebitNoteVoucherType("FACTURA_A")).toBe(2);
    expect(mapInvoiceTypeToArcaDebitNoteVoucherType("FACTURA_B")).toBe(7);
    expect(mapInvoiceTypeToArcaDebitNoteVoucherType("FACTURA_C")).toBe(12);
    expect(
      mapInvoiceTypeToArcaDebitNoteVoucherType("FACTURA_A_RETENCION")
    ).toBe(52);
  });

  it("conserva la asociación única y prorratea importes de la factura origen", () => {
    const request = buildArcaDebitNoteVoucherRequest({
      creditNote: { id: "debit-note-1", amount: 605, invoiceType: "FACTURA_A" },
      sale: buildSale(),
      pointOfSale: 5,
      cbteFch: TEST_CBTE_FCH,
      associatedVoucherDate: TEST_ASSOCIATED_CBTE_FCH,
    });

    expect(request).toMatchObject({
      CbteTipo: 2,
      ImpTotal: 605,
      ImpNeto: 500,
      ImpIVA: 105,
      CbtesAsoc: [{ Tipo: 1, PtoVta: 3, Nro: 42 }],
    });
    expect(request.CbtesAsoc).toHaveLength(1);
  });

  it("usa el desglose explícito de la ND sin prorratear la factura origen", () => {
    const request = buildArcaDebitNoteVoucherRequest({
      creditNote: {
        id: "debit-note-1",
        amount: 130,
        invoiceType: "FACTURA_A",
        useExplicitTaxes: true,
        taxes: [
          {
            id: "iva",
            taxId: "iva",
            name: "IVA 21%",
            rate: 21,
            baseAmount: 100,
            taxAmount: 21,
            taxCodeSnapshot: "IVA_21",
          },
          {
            id: "iibb",
            taxId: "iibb",
            name: "IIBB",
            rate: 3,
            baseAmount: 100,
            taxAmount: 9,
            taxCodeSnapshot: "TRIBUTO_02",
          },
        ],
      },
      sale: buildSale(),
      pointOfSale: 5,
      cbteFch: TEST_CBTE_FCH,
      associatedVoucherDate: TEST_ASSOCIATED_CBTE_FCH,
    });

    expect(request).toMatchObject({
      ImpTotal: 130,
      ImpNeto: 100,
      ImpIVA: 21,
      ImpTrib: 9,
    });
    expect(request.Iva).toEqual([{ Id: 5, BaseImp: 100, Importe: 21 }]);
    expect(request.Tributos).toEqual([
      expect.objectContaining({ Id: 2, BaseImp: 100, Importe: 9 }),
    ]);
  });
});

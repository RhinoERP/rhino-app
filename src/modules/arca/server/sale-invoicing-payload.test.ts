import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildArcaVoucherRequestFromSale } from "./sale-invoicing.service";

const MISSING_FISCAL_CLASSIFICATION_PATTERN =
  /debe clasificar su operación como gravada con IVA o exenta/;
const EXEMPT_WITH_VAT_PATTERN =
  /marcada exenta de IVA, pero tiene impuestos IVA asociados/;

function buildContext(params: {
  totalAmount: number;
  subTotal?: number;
  globalDiscountAmount?: number;
  isVatExempt?: boolean;
  taxes: Array<{
    id: string;
    taxId: string;
    name: string;
    rate: number;
    baseAmount: number;
    taxAmount: number;
    taxCodeSnapshot: string;
  }>;
}) {
  return {
    sale: {
      totalAmount: params.totalAmount,
      subTotal: params.subTotal ?? params.totalAmount,
      globalDiscountAmount: params.globalDiscountAmount ?? 0,
      isVatExempt: params.isVatExempt ?? false,
      invoiceType: "FACTURA_B",
      customer: {
        cuit: "30-54139510-1",
        taxCondition: "EXENTO",
      },
      taxes: params.taxes,
    },
    effectiveInvoiceType: "FACTURA_B",
    resolvedCredentials: { pointOfSale: 2 },
  } as never;
}

describe("buildArcaVoucherRequestFromSale", () => {
  it("serializes an explicitly exempt sale into ImpOpEx without IVA", () => {
    const request = buildArcaVoucherRequestFromSale(
      buildContext({
        totalAmount: 300_000,
        isVatExempt: true,
        taxes: [],
      }),
      { code: "PES", rate: 1, sameCurrencySettlement: false }
    );

    expect(request).toMatchObject({
      CbteTipo: 6,
      PtoVta: 2,
      CondicionIVAReceptorId: 4,
      ImpTotal: 300_000,
      ImpNeto: 0,
      ImpOpEx: 300_000,
      ImpIVA: 0,
      ImpTrib: 0,
    });
    expect(request.Iva).toBeUndefined();
  });

  it("rejects a positive Factura B with no explicit IVA or exempt classification", () => {
    expect(() =>
      buildArcaVoucherRequestFromSale(
        buildContext({ totalAmount: 300_000, taxes: [] }),
        { code: "PES", rate: 1, sameCurrencySettlement: false }
      )
    ).toThrow(MISSING_FISCAL_CLASSIFICATION_PATTERN);
  });

  it("rejects an exempt sale that still has IVA in its fiscal snapshot", () => {
    expect(() =>
      buildArcaVoucherRequestFromSale(
        buildContext({
          totalAmount: 363_000,
          isVatExempt: true,
          taxes: [
            {
              id: "tax-iva",
              taxId: "tax-iva",
              name: "IVA 21%",
              rate: 21,
              baseAmount: 300_000,
              taxAmount: 63_000,
              taxCodeSnapshot: "IVA_21",
            },
          ],
        }),
        { code: "PES", rate: 1, sameCurrencySettlement: false }
      )
    ).toThrow(EXEMPT_WITH_VAT_PATTERN);
  });
});

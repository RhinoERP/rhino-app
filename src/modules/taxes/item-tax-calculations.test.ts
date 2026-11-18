import { describe, expect, it } from "vitest";
import { buildItemizedTaxPlan } from "./item-tax-calculations";

describe("buildItemizedTaxPlan", () => {
  it.each([
    2, 6,
  ])("conserva el impuesto agregado de 500 líneas con precisión %i", (precision) => {
    const plan = buildItemizedTaxPlan({
      lines: Array.from({ length: 500 }, (_, index) => ({
        lineId: `item-${index}`,
        productId: "product-1",
        netAmount: 1.01,
        taxes: [{ taxId: "iva-21", name: "IVA 21%", rate: 21 }],
      })),
      globalDiscountAmount: 0,
      precision,
    });

    expect(plan.aggregateTaxes[0]).toMatchObject({
      baseAmount: 505,
      taxAmount: 106.05,
    });
    expect(plan.totalTaxAmount).toBe(106.05);
    expect(
      plan.itemTaxes.reduce(
        (sum, tax) =>
          sum + Number(tax.taxAmount.toFixed(precision).replace(".", "")),
        0
      )
    ).toBe(106.05 * 10 ** precision);
  });

  it("calcula impuestos por producto y agrega por alícuota", () => {
    const plan = buildItemizedTaxPlan({
      lines: [
        {
          lineId: "item-1",
          productId: "product-1",
          netAmount: 100,
          taxes: [
            {
              taxId: "iva-21",
              name: "IVA 21%",
              rate: 21,
              taxCodeSnapshot: "IVA_21",
            },
          ],
        },
        {
          lineId: "item-2",
          productId: "product-2",
          netAmount: 200,
          taxes: [
            {
              taxId: "iva-105",
              name: "IVA 10.5%",
              rate: 10.5,
              taxCodeSnapshot: "IVA_10_5",
            },
          ],
        },
      ],
      globalDiscountAmount: 30,
    });

    expect(plan.aggregateTaxes).toEqual([
      expect.objectContaining({
        taxId: "iva-21",
        baseAmount: 90,
        taxAmount: 18.9,
      }),
      expect.objectContaining({
        taxId: "iva-105",
        baseAmount: 180,
        taxAmount: 18.9,
      }),
    ]);
    expect(plan.totalTaxAmount).toBe(37.8);
  });

  it("usa impuestos fallback cuando el ítem no trae asignación", () => {
    const plan = buildItemizedTaxPlan({
      lines: [{ lineId: "item-1", productId: "product-1", netAmount: 100 }],
      globalDiscountAmount: 0,
      fallbackTaxes: [
        {
          taxId: "iva-21",
          name: "IVA 21%",
          rate: 21,
          taxCodeSnapshot: "IVA_21",
        },
      ],
    });

    expect(plan.itemTaxes).toEqual([
      expect.objectContaining({
        lineId: "item-1",
        source: "fallback",
        taxAmount: 21,
      }),
    ]);
    expect(plan.totalTaxAmount).toBe(21);
  });
});

import { describe, expect, it } from "vitest";
import { buildItemizedTaxPlan } from "./item-tax-calculations";

describe("buildItemizedTaxPlan", () => {
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
        taxAmount: 18.89,
      }),
      expect.objectContaining({
        taxId: "iva-105",
        baseAmount: 180,
        taxAmount: 18.89,
      }),
    ]);
    expect(plan.totalTaxAmount).toBe(37.78);
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

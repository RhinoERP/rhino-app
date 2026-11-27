import { describe, expect, it } from "vitest";
import { calculateQuoteTaxes } from "./client-quote-taxes";

describe("client quote taxes", () => {
  it("adds configured product taxes and manual taxes without replacing either", () => {
    const result = calculateQuoteTaxes(
      [
        {
          lineId: "one",
          productId: "product-one",
          netAmount: 100,
          taxes: [{ taxId: "iva", name: "IVA", rate: 21 }],
        },
        {
          lineId: "two",
          productId: "product-two",
          netAmount: 50,
          taxes: [],
        },
      ],
      [{ name: "Percepción", rate: 2 }]
    );

    expect(result).toMatchObject({
      subtotal: 150,
      taxAmount: 24,
      total: 174,
      taxBreakdown: [
        { name: "IVA", rate: 21, taxAmount: 21 },
        { name: "Percepción", rate: 2, taxAmount: 3 },
      ],
    });
    expect(
      result.itemTaxes.filter((tax) => tax.source === "manual")
    ).toHaveLength(2);
    expect(
      result.itemTaxes.find((tax) => tax.source === "manual")?.taxId
    ).toBeNull();
  });
});

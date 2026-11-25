import { describe, expect, it } from "vitest";
import { quoteSellingUnitFactor, quoteUnitSnapshot } from "./selling-unit";

describe("quote selling units", () => {
  it("prices boxes using the configured units and records the factor", () => {
    const product = { unitOfMeasure: "UN", unitsPerBox: 6 };
    expect(quoteSellingUnitFactor(product, "CAJAS")).toBe(6);
    expect(quoteUnitSnapshot(product, "CAJAS")).toBe("CAJAS (6 UN por caja)");
    expect(quoteSellingUnitFactor(product, "UNIDADES")).toBe(1);
  });

  it("rejects boxes without an integer conversion or for a weighted product", () => {
    expect(() =>
      quoteSellingUnitFactor({ unitOfMeasure: "UN" }, "CAJAS")
    ).toThrow();
    expect(() =>
      quoteSellingUnitFactor({ unitOfMeasure: "KG", unitsPerBox: 6 }, "CAJAS")
    ).toThrow();
    expect(() =>
      quoteSellingUnitFactor({ unitOfMeasure: "UN", unitsPerBox: 1.5 }, "CAJAS")
    ).toThrow();
  });
});

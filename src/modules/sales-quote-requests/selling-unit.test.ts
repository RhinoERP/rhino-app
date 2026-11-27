import { describe, expect, it } from "vitest";
import {
  formatQuoteUnitQuantity,
  isValidCaseQuoteQuantity,
  quoteSellingUnitFactor,
  quoteUnitSnapshot,
} from "./selling-unit";

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

  it("quotes a CAJA product in stored individual units, preserving packaging in the snapshot", () => {
    const product = { unitOfMeasure: "CAJA", unitsPerBox: 6 };
    expect(quoteSellingUnitFactor(product, "UNIDADES")).toBeCloseTo(1 / 6);
    expect(quoteUnitSnapshot(product, "UNIDADES")).toBe(
      "UNIDADES (6 UN por caja)"
    );
    expect(formatQuoteUnitQuantity(8, quoteUnitSnapshot(product))).toBe(
      "1 caja y 2 unidades sueltas · 8 unidades totales"
    );
    expect(isValidCaseQuoteQuantity(product, "UNIDADES", 8)).toBe(true);
    expect(isValidCaseQuoteQuantity(product, "UNIDADES", 1.5)).toBe(false);
    expect(isValidCaseQuoteQuantity(product, "CAJAS", 1)).toBe(false);
    expect(isValidCaseQuoteQuantity(product, "UNIDADES", 0)).toBe(false);
    expect(() => quoteSellingUnitFactor(product, "CAJAS")).toThrow();
  });
});

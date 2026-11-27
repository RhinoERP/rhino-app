import { describe, expect, it } from "vitest";
import {
  formatCaseUnitQuantity,
  getBaseUnitPrice,
  getPricePerIndividualUnit,
  normalizeCaseUnitQuantity,
  splitCaseUnitQuantity,
  tryNormalizeCaseUnitQuantity,
} from "./case-units";

describe("case unit quantities", () => {
  it("normalizes overflowing loose units into additional boxes", () => {
    const totalUnits = normalizeCaseUnitQuantity({ boxes: 5, units: 7 }, 4);

    expect(totalUnits).toBe(27);
    expect(splitCaseUnitQuantity(totalUnits, 4)).toEqual({
      boxes: 6,
      units: 3,
    });
  });

  it("displays a total stock quantity as boxes plus the remainder", () => {
    expect(splitCaseUnitQuantity(20, 6)).toEqual({ boxes: 3, units: 2 });
    expect(formatCaseUnitQuantity(6, 6)).toBe("1 caja · 6 unidades totales");
    expect(formatCaseUnitQuantity(8, 6)).toBe(
      "1 caja y 2 unidades sueltas · 8 unidades totales"
    );
  });

  it("calculates the proportional individual-unit price from a box price", () => {
    expect(getPricePerIndividualUnit(54_000, 6)).toBe(9000);
    expect(
      normalizeCaseUnitQuantity({ boxes: 5, units: 7 }, 4) *
        getBaseUnitPrice(100, "CAJA", 4)
    ).toBe(675);
    expect(getBaseUnitPrice(100, "UN", null)).toBe(100);
  });

  it("rejects invalid box sizes and fractional inventory counts", () => {
    expect(() => splitCaseUnitQuantity(3, 0)).toThrow();
    expect(() =>
      normalizeCaseUnitQuantity({ boxes: 1.5, units: 0 }, 6)
    ).toThrow();
    expect(
      tryNormalizeCaseUnitQuantity({ boxes: 1.5, units: 0 }, 6)
    ).toBeNull();
    expect(tryNormalizeCaseUnitQuantity({ boxes: 1, units: 2 }, 6)).toBe(8);
    expect(() =>
      normalizeCaseUnitQuantity({ boxes: Number.MAX_SAFE_INTEGER, units: 0 }, 6)
    ).toThrow();
  });
});

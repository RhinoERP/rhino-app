import { describe, expect, it } from "vitest";
import {
  formatCaseUnitQuantity,
  getBaseUnitPrice,
  getPricePerIndividualUnit,
  normalizeCaseUnitQuantity,
  splitCaseUnitQuantity,
  summarizeCaseQuantities,
  tryNormalizeCaseUnitQuantity,
} from "./case-units";

describe("case unit quantities", () => {
  it("represents CAM-001 sale and purchase quantities without changing canonical units", () => {
    expect(formatCaseUnitQuantity(61, 8)).toBe("7 cajas + 5 unidades");
    expect(formatCaseUnitQuantity(92, 8)).toBe("11 cajas + 4 unidades");
    expect(92 * getPricePerIndividualUnit(104_000, 8)).toBe(1_196_000);
  });

  it("groups the same SKU without forming boxes from different products' loose units", () => {
    const item = {
      productId: "CAM-001",
      name: "Campari",
      unitOfMeasure: "CAJA",
      unitsPerBox: 8,
    };
    const summary = summarizeCaseQuantities([
      { ...item, quantity: 10 },
      { ...item, quantity: 51 },
      {
        ...item,
        productId: "other",
        name: "Other",
        unitsPerBox: 6,
        quantity: 1,
      },
      { productId: "UN", name: "Unidad", unitOfMeasure: "UN", quantity: 3 },
    ]);
    expect(
      summary.cases.map((entry) =>
        formatCaseUnitQuantity(entry.quantity, entry.unitsPerBox ?? 0)
      )
    ).toEqual(["7 cajas + 5 unidades", "0 cajas + 1 unidad"]);
    expect(summary.otherUnits).toBe(3);
    expect(summary.hasOtherProducts).toBe(true);
  });
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

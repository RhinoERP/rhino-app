import { describe, expect, it } from "vitest";
import { getStockMeasureTotals } from "./stock-measure-totals";

describe("totales por unidad de medida", () => {
  it.each([
    { uom: "KG", expected: { units: 0, kg: 12.5, lt: 0 } },
    { uom: "LT", expected: { units: 0, kg: 0, lt: 12.5 } },
    { uom: "UN", expected: { units: 12.5, kg: 0, lt: 0 } },
    { uom: null, expected: { units: 12.5, kg: 0, lt: 0 } },
  ])("mantiene la cantidad en $uom", ({ uom, expected }) => {
    expect(getStockMeasureTotals(12.5, uom)).toEqual(expected);
  });
});

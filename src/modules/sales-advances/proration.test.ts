import { describe, expect, it } from "vitest";
import {
  advancePercentage,
  prorateFiscalSnapshots,
  suggestedAdvanceAmount,
} from "./proration";

describe("sales advance fiscal proration", () => {
  it("uses the last fiscal line to absorb rounding", () => {
    const result = prorateFiscalSnapshots(
      [
        { baseAmount: 82_644.63, taxAmount: 17_355.37 },
        { baseAmount: 1000, taxAmount: 0 },
      ],
      0.3,
      5206.61
    );
    expect(result.reduce((sum, tax) => sum + tax.taxAmount, 0)).toBe(5206.61);
  });

  it("calculates editable suggestions with money precision", () => {
    expect(suggestedAdvanceAmount(100_000, 30)).toBe(30_000);
    expect(advancePercentage(100_000, 30_000)).toBe(30);
  });

  it("keeps the $100,000 / 30% fiscal composition exact", () => {
    const result = prorateFiscalSnapshots(
      [{ baseAmount: 82_644.63, taxAmount: 17_355.37 }],
      0.3,
      5206.61,
      24_793.39
    );
    expect(result).toEqual([{ baseAmount: 24_793.39, taxAmount: 5206.61 }]);
    expect(result[0].baseAmount + result[0].taxAmount).toBe(30_000);
  });

  it("allows a 100% advance without changing the fiscal snapshots", () => {
    const result = prorateFiscalSnapshots(
      [
        { baseAmount: 82_644.63, taxAmount: 17_355.37 },
        { baseAmount: 1000, taxAmount: 0 },
      ],
      1,
      17_355.37
    );
    expect(result).toEqual([
      { baseAmount: 82_644.63, taxAmount: 17_355.37 },
      { baseAmount: 1000, taxAmount: 0 },
    ]);
  });
});

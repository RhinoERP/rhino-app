import { describe, expect, it } from "vitest";
import { truncateMoney, truncateToDecimals } from "./decimal";

describe("truncateMoney", () => {
  it("preserves cents that JavaScript represents slightly below their value", () => {
    expect(truncateMoney(1155.85)).toBe(1155.85);
    expect(truncateMoney(-1155.85)).toBe(-1155.85);
  });

  it("still truncates values beyond the requested decimal places", () => {
    expect(truncateMoney(1155.859)).toBe(1155.85);
    expect(truncateMoney(-1155.859)).toBe(-1155.85);
    expect(truncateToDecimals(1.239, 2)).toBe(1.23);
  });
});

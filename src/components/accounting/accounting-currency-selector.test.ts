import { describe, expect, it } from "vitest";
import {
  convertAccountingAmountToArs,
  DEFAULT_TIPO_CAMBIO_USD,
  parseAccountingAmount,
} from "./accounting-currency-selector";

describe("accounting exchange rate", () => {
  it("preserves the existing mock rate for shared dialogs", () => {
    expect(DEFAULT_TIPO_CAMBIO_USD).toBe(1240);
  });

  it("converts with the explicitly entered rate and leaves ARS unchanged", () => {
    const rate = parseAccountingAmount("1.250,50");
    expect(convertAccountingAmountToArs(2, "USD", rate)).toBe(2501);
    expect(convertAccountingAmountToArs(2, "ARS", rate)).toBe(2);
  });
});

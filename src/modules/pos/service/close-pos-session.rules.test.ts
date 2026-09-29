import { describe, expect, it } from "vitest";
import {
  CASH_DIFFERENCE_DESCRIPTION_REQUIRED_MESSAGE,
  validateCloseSessionDifferenceJustification,
} from "./close-pos-session.rules";

describe("close POS session rules", () => {
  it("permite cerrar caja cuando no hay diferencia sin descripción", () => {
    const result = validateCloseSessionDifferenceJustification({
      expectedCashEnd: 1000,
      realCashEnd: 1000,
      notes: null,
    });

    expect(result.differenceAmount).toBe(0);
    expect(result.notes).toBeNull();
  });

  it("rechaza cierre cuando hay diferencia y falta descripción", () => {
    expect(() =>
      validateCloseSessionDifferenceJustification({
        expectedCashEnd: 1000,
        realCashEnd: 950,
        notes: "   ",
      })
    ).toThrow(CASH_DIFFERENCE_DESCRIPTION_REQUIRED_MESSAGE);
  });

  it("permite cerrar cuando hay diferencia y se envía descripción", () => {
    const result = validateCloseSessionDifferenceJustification({
      expectedCashEnd: 1000,
      realCashEnd: 950,
      notes: "Faltante por retiro no registrado",
    });

    expect(result.differenceAmount).toBe(-50);
    expect(result.notes).toBe("Faltante por retiro no registrado");
  });
});

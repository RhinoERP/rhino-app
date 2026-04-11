import assert from "node:assert/strict";
import test from "node:test";
import {
  CASH_DIFFERENCE_DESCRIPTION_REQUIRED_MESSAGE,
  ClosePosSessionValidationError,
  validateCloseSessionDifferenceJustification,
} from "./close-pos-session.rules";

test("permite cerrar caja cuando no hay diferencia sin descripción", () => {
  const result = validateCloseSessionDifferenceJustification({
    expectedCashEnd: 1000,
    realCashEnd: 1000,
    notes: null,
  });

  assert.equal(result.differenceAmount, 0);
  assert.equal(result.notes, null);
});

test("rechaza cierre cuando hay diferencia y falta descripción", () => {
  assert.throws(
    () =>
      validateCloseSessionDifferenceJustification({
        expectedCashEnd: 1000,
        realCashEnd: 950,
        notes: "   ",
      }),
    (error) => {
      assert.ok(error instanceof ClosePosSessionValidationError);
      assert.equal(error.message, CASH_DIFFERENCE_DESCRIPTION_REQUIRED_MESSAGE);
      return true;
    }
  );
});

test("permite cerrar cuando hay diferencia y se envía descripción", () => {
  const result = validateCloseSessionDifferenceJustification({
    expectedCashEnd: 1000,
    realCashEnd: 950,
    notes: "Faltante por retiro no registrado",
  });

  assert.equal(result.differenceAmount, -50);
  assert.equal(result.notes, "Faltante por retiro no registrado");
});

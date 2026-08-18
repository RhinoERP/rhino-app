import { describe, expect, it } from "vitest";
import {
  balanceAfterAdvances,
  canCreatePreventaAdvance,
  canRegisterAdvance,
} from "./preventa-advance";

describe("preventa advance rules", () => {
  it("only accepts an approved operational preventa", () => {
    expect(canCreatePreventaAdvance("APROBADA")).toBe(true);
    expect(canCreatePreventaAdvance("CON_ANTICIPO")).toBe(true);
    expect(canCreatePreventaAdvance("BORRADOR")).toBe(false);
    expect(canCreatePreventaAdvance("CONVERTIDA_A_VENTA")).toBe(false);
  });

  it("supports partial and multiple advances without exceeding the agreement", () => {
    expect(
      canRegisterAdvance({
        total: 100_000,
        existingActiveAmounts: [30_000, 20_000],
        nextAmount: 50_000,
      })
    ).toBe(true);
    expect(
      canRegisterAdvance({
        total: 100_000,
        existingActiveAmounts: [30_000, 20_000],
        nextAmount: 50_000.01,
      })
    ).toBe(false);
  });

  it("calculates a balance invoice from every applicable advance", () => {
    expect(
      balanceAfterAdvances(100_000, [{ amount: 30_000 }, { amount: 20_000 }])
    ).toBe(50_000);
    expect(balanceAfterAdvances(100_000, [{ amount: 100_000 }])).toBe(0);
  });
});

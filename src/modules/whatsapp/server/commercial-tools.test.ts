import { describe, expect, it } from "vitest";
import { isExplicitConfirmation } from "./confirmation";

describe("isExplicitConfirmation", () => {
  it("acepta confirmaciones inequívocas del cliente", () => {
    expect(isExplicitConfirmation("Sí, confirmo")).toBe(true);
    expect(isExplicitConfirmation("Dale, avancemos")).toBe(true);
    expect(isExplicitConfirmation("Quiero comprar")).toBe(true);
  });

  it("no interpreta consultas o expresiones ambiguas como una confirmación", () => {
    expect(isExplicitConfirmation("¿Cuánto demora?")).toBe(false);
    expect(isExplicitConfirmation("No estoy seguro")).toBe(false);
    expect(isExplicitConfirmation("Podría ser, avisame")).toBe(false);
    expect(isExplicitConfirmation(null)).toBe(false);
  });
});

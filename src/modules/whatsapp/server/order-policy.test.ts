import { describe, expect, it } from "vitest";
import { isExplicitConfirmation } from "./confirmation";
import {
  isAmbiguousReturn,
  isPurchaseRequest,
  isRepeatRequest,
} from "./order-policy";

describe("commercial order intent guards", () => {
  it.each([
    "Hola",
    "Gracias",
    "Sí",
    "ok",
    "¿Cuánto sale?",
    "Quiero saber el precio",
    "Quisiera consultar el stock",
  ])("does not open another order for %s", (text) => {
    expect(isPurchaseRequest(text)).toBe(false);
  });
  it.each([
    "Quiero otro pedido",
    "Necesito comprar 2 quesos",
    "Dame un termo",
    "Armá un nuevo pedido",
  ])("recognizes a new purchase: %s", (text) => {
    expect(isPurchaseRequest(text)).toBe(true);
  });
  it.each([
    "Quiero lo mismo que la última vez",
    "Repetíme el anterior",
    "Otra vez el pedido del lunes",
  ])("recognizes repeat intent: %s", (text) => {
    expect(isRepeatRequest(text)).toBe(true);
  });
  it("distinguishes an ambiguous return from continuing an unfinished purchase", () => {
    expect(isAmbiguousReturn("Hola!")).toBe(true);
    expect(isAmbiguousReturn("Sí")).toBe(true);
    expect(isAmbiguousReturn("Seguimos con los dos quesos de ayer")).toBe(
      false
    );
  });
  it.each([
    "sí, pero sacá dos unidades",
    "dale, cambiá el queso",
    "ok no",
    "confirmo el de ayer, no este",
    "sí quiero saber el precio",
    null,
  ])("rejects a conditional or ambiguous confirmation: %s", (text) => {
    expect(isExplicitConfirmation(text)).toBe(false);
  });
});

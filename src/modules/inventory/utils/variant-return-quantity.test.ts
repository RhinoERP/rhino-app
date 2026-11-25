import { describe, expect, it } from "vitest";
import { hasFractionalVariantReturn } from "./variant-return-quantity";

describe("variant return quantities", () => {
  it("permite cantidades fraccionarias para productos simples", () => {
    expect(
      hasFractionalVariantReturn({
        variantId: null,
        quantity: 0.25,
        unitQuantity: 0.5,
      })
    ).toBe(false);
  });

  it("rechaza fracciones en las piezas de una variante", () => {
    expect(
      hasFractionalVariantReturn({ variantId: "variant-1", quantity: 0.5 })
    ).toBe(true);
    expect(
      hasFractionalVariantReturn({
        variantId: "variant-1",
        quantity: 2,
        unitQuantity: 0.5,
      })
    ).toBe(true);
  });

  it("acepta una devolución parcial de piezas enteras", () => {
    expect(
      hasFractionalVariantReturn({ variantId: "variant-1", quantity: 2 })
    ).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { splitQuoteItemAmounts } from "./split-quote-item-amounts";

describe("importes de un ítem dividido", () => {
  it("mantiene los totales de un descuento fijo al recibir 8 de 10", () => {
    const amounts = splitQuoteItemAmounts({
      quantity: 10,
      assignedQuantity: 8,
      subtotal: 1000,
      discountAmount: 100,
    });
    expect(amounts).toEqual({
      assignedSubtotal: 800,
      remainingSubtotal: 200,
      assignedDiscountAmount: 80,
      remainingDiscountAmount: 20,
    });
  });

  it("asigna el centavo residual a la porción pendiente", () => {
    const amounts = splitQuoteItemAmounts({
      quantity: 3,
      assignedQuantity: 1,
      subtotal: 10,
      discountAmount: 1,
    });
    expect(amounts.assignedDiscountAmount).toBe(0.33);
    expect(amounts.remainingDiscountAmount).toBe(0.67);
    expect(amounts.assignedSubtotal + amounts.remainingSubtotal).toBe(10);
  });

  it("conserva la ausencia de descuento", () => {
    const amounts = splitQuoteItemAmounts({
      quantity: 2,
      assignedQuantity: 1,
      subtotal: 50,
      discountAmount: null,
    });
    expect(amounts.assignedDiscountAmount).toBeNull();
    expect(amounts.remainingDiscountAmount).toBeNull();
  });
});

import { truncateMoney } from "@/lib/decimal";

/** Preserve the original line amounts exactly, allocating rounding to the remainder. */
export function splitQuoteItemAmounts(input: {
  quantity: number;
  assignedQuantity: number;
  subtotal: number;
  discountAmount: number | null;
}) {
  const { quantity, assignedQuantity, subtotal, discountAmount } = input;
  if (
    !(
      Number.isFinite(quantity) &&
      quantity > 0 &&
      Number.isFinite(assignedQuantity) &&
      assignedQuantity > 0 &&
      assignedQuantity < quantity
    )
  ) {
    throw new Error(
      "La cantidad dividida debe ser mayor a 0 y menor a la original"
    );
  }
  const assignedSubtotal = truncateMoney(
    (subtotal * assignedQuantity) / quantity
  );
  const assignedDiscountAmount =
    discountAmount === null
      ? null
      : truncateMoney((discountAmount * assignedQuantity) / quantity);
  return {
    assignedSubtotal,
    remainingSubtotal: truncateMoney(subtotal - assignedSubtotal),
    assignedDiscountAmount,
    remainingDiscountAmount:
      discountAmount === null || assignedDiscountAmount === null
        ? null
        : truncateMoney(discountAmount - assignedDiscountAmount),
  };
}

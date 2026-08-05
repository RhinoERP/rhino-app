import { truncateMoney } from "@/lib/decimal";

export type { AdvanceTaxSnapshot } from "./types";

type FiscalAmount = { baseAmount: number; taxAmount: number };

/**
 * Prorates immutable fiscal snapshots.  The final item absorbs rounding so
 * ARCA's total equals the user-confirmed advance amount exactly.
 */
export function prorateFiscalSnapshots<T extends FiscalAmount>(
  snapshots: T[],
  ratio: number,
  targetTaxAmount: number,
  targetBaseAmount?: number
): T[] {
  if (!snapshots.length) {
    return [];
  }

  let accumulatedBase = 0;
  let accumulatedTax = 0;
  const proportionalBase = truncateMoney(
    snapshots.reduce((sum, item) => sum + item.baseAmount, 0) * ratio
  );
  const finalBaseAmount = targetBaseAmount ?? proportionalBase;
  return snapshots.map((snapshot, index) => {
    const isLast = index === snapshots.length - 1;
    const baseAmount = isLast
      ? truncateMoney(finalBaseAmount - accumulatedBase)
      : truncateMoney(snapshot.baseAmount * ratio);
    const taxAmount = isLast
      ? truncateMoney(targetTaxAmount - accumulatedTax)
      : truncateMoney(snapshot.taxAmount * ratio);
    accumulatedBase = truncateMoney(accumulatedBase + baseAmount);
    accumulatedTax = truncateMoney(accumulatedTax + taxAmount);
    return { ...snapshot, baseAmount, taxAmount };
  });
}

export function suggestedAdvanceAmount(total: number, percentage: number) {
  return truncateMoney((total * percentage) / 100);
}

export function advancePercentage(total: number, amount: number) {
  return total > 0 ? truncateMoney((amount * 100) / total) : 0;
}

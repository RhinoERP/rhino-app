import { truncateToDecimals } from "@/lib/decimal";

export type LineExtrasInput = Array<{ price: number }>;

export function computeLineExtrasTotal(
  extras: LineExtrasInput | undefined
): number {
  return (extras ?? []).reduce((sum, extra) => sum + extra.price, 0);
}

export function computeLineGross(
  unitPrice: number,
  quantity: number,
  extras: LineExtrasInput | undefined
): number {
  const extrasTotal = computeLineExtrasTotal(extras);
  return truncateToDecimals(quantity * unitPrice + extrasTotal * quantity, 6);
}

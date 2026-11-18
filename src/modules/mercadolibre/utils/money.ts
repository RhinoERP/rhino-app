import { truncateMoney } from "@/lib/decimal";

/** Serialize already-truncated cents before aggregating many monetary lines. */
export function sumMeliMoney(values: readonly number[]): number {
  let cents = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) {
      throw new Error("Importe monetario inválido.");
    }
    cents += Number(truncateMoney(value).toFixed(2).replace(".", ""));
    if (!Number.isSafeInteger(cents)) {
      throw new Error("El importe supera la precisión monetaria admitida.");
    }
  }
  return cents / 100;
}

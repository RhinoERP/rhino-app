import { truncateMoney } from "@/lib/decimal";

/** Value native components with one commercial quote; never add different currencies. */
export function valueStock(ars: number, usd: number, rate: number | null) {
  const validRate = rate !== null && Number.isFinite(rate) && rate > 0;
  if (validRate) {
    return {
      ars: truncateMoney(ars + usd * rate),
      usd: truncateMoney(usd + ars / rate),
    };
  }
  return {
    ars: usd === 0 ? truncateMoney(ars) : null,
    usd: ars === 0 ? truncateMoney(usd) : null,
  };
}

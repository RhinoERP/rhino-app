import { truncateMoney } from "@/lib/decimal";

export const eligiblePreventaAdvanceStatuses = [
  "APROBADA",
  "CON_ANTICIPO",
  "EN_PRODUCCION",
  "LISTA_PARA_CONVERTIR",
] as const;

export function canCreatePreventaAdvance(status: string | null | undefined) {
  return eligiblePreventaAdvanceStatuses.includes(
    status as (typeof eligiblePreventaAdvanceStatuses)[number]
  );
}

export function balanceAfterAdvances(
  total: number,
  advances: Array<{ amount: number; appliedAmount?: number }>
) {
  const unapplied = truncateMoney(
    advances.reduce(
      (sum, advance) =>
        sum + Math.max(0, advance.amount - (advance.appliedAmount ?? 0)),
      0
    )
  );
  return Math.max(0, truncateMoney(total - unapplied));
}

export function canRegisterAdvance(params: {
  total: number;
  existingActiveAmounts: number[];
  nextAmount: number;
}) {
  const committed = truncateMoney(
    params.existingActiveAmounts.reduce((sum, amount) => sum + amount, 0)
  );
  return (
    params.nextAmount > 0 &&
    truncateMoney(committed + params.nextAmount) <= truncateMoney(params.total)
  );
}

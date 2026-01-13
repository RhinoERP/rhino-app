"use client";

import { useQuery } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/format";

type CustomerBalanceDisplayProps = {
  orgSlug: string;
  customerId: string;
  pendingBalance: number;
};

export function CustomerBalanceDisplay({
  orgSlug,
  customerId,
  pendingBalance,
}: CustomerBalanceDisplayProps) {
  const { data: creditBalance = 0 } = useQuery<number>({
    queryKey: ["customer-credit", orgSlug, customerId],
    queryFn: async () => {
      const response = await fetch(
        `/api/collections/customer-credit?orgSlug=${orgSlug}&customerId=${customerId}`
      );

      if (!response.ok) {
        return 0;
      }

      const data = await response.json();
      return data.creditBalance ?? 0;
    },
    enabled: Boolean(customerId),
  });

  const netBalance = pendingBalance - creditBalance;
  const hasCredit = creditBalance > 0;
  const isInFavor = netBalance < 0;

  if (isInFavor) {
    return (
      <div className="text-right">
        <p className="text-green-600 text-xs">Saldo a favor</p>
        <p className="font-semibold text-green-600">
          {formatCurrency(Math.abs(netBalance))}
        </p>
      </div>
    );
  }

  if (hasCredit) {
    return (
      <div className="text-right">
        <p className="text-muted-foreground text-xs">Pendiente</p>
        <p className="font-semibold">{formatCurrency(netBalance)}</p>
        <p className="text-green-600 text-xs">
          (Crédito: {formatCurrency(creditBalance)})
        </p>
      </div>
    );
  }

  return (
    <div className="text-right">
      <p className="text-muted-foreground text-xs">Pendiente</p>
      <p className="font-semibold">{formatCurrency(pendingBalance)}</p>
    </div>
  );
}

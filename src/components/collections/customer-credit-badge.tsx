"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";

type CustomerCreditBadgeProps = {
  orgSlug: string;
  customerId: string;
};

export function CustomerCreditBadge({
  orgSlug,
  customerId,
}: CustomerCreditBadgeProps) {
  const { data: creditBalance } = useQuery<number>({
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

  if (!creditBalance || creditBalance <= 0) {
    return null;
  }

  return (
    <Badge
      className="bg-green-100 text-green-800 hover:bg-green-100"
      variant="secondary"
    >
      💰 Crédito: ${creditBalance.toFixed(2)}
    </Badge>
  );
}

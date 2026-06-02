"use client";

import { CaretDownIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatCurrency } from "@/lib/format";
import type { CustomerCreditApiResponse } from "@/modules/collections/types";

type CustomerCreditBreakdownPopoverProps = {
  orgSlug: string;
  customerId: string;
  supplierId?: string | null;
};

export function CustomerCreditBreakdownPopover({
  orgSlug,
  customerId,
  supplierId,
}: CustomerCreditBreakdownPopoverProps) {
  const { data } = useQuery<CustomerCreditApiResponse>({
    queryKey: ["customer-credit-breakdown", orgSlug, customerId, supplierId],
    queryFn: async () => {
      const supplierParam = supplierId ? `&supplierId=${supplierId}` : "";
      const res = await fetch(
        `/api/collections/customer-credit?orgSlug=${orgSlug}&customerId=${customerId}${supplierParam}`
      );
      if (!res.ok) {
        return { total: 0, enabled: false, bySupplier: [] };
      }
      return res.json();
    },
    enabled: Boolean(customerId),
    staleTime: 60 * 1000,
  });

  if (!data?.enabled || (data?.bySupplier?.length ?? 0) <= 1) {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button className="ml-1 h-5 w-5 p-0" size="icon" variant="ghost">
          <CaretDownIcon className="size-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 p-3">
        <div className="space-y-2">
          <p className="font-medium text-xs">Crédito por proveedor</p>
          <div className="space-y-1.5">
            {data.bySupplier.map((entry) => (
              <div
                className="flex items-center justify-between text-xs"
                key={entry.supplierId ?? "null"}
              >
                <span className="text-muted-foreground">
                  {entry.supplierName}
                </span>
                <span className="font-medium tabular-nums">
                  {formatCurrency(entry.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

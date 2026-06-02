"use client";

import { CaretDownIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatCurrency } from "@/lib/format";
import type { CustomerCreditApiResponse } from "@/modules/collections/types";

type CustomerBalanceDisplayProps = {
  orgSlug: string;
  customerId: string;
  pendingBalance: number;
  supplierId?: string | null;
};

type InfoTooltipProps = {
  content: string;
  label: string;
};

function InfoTooltip({ content, label }: InfoTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={label}
          className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground/70 transition hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          type="button"
        >
          <CircleHelp className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        className="max-w-[240px] bg-black text-white [&>svg]:bg-black [&>svg]:fill-black"
        side="top"
        sideOffset={6}
      >
        <p>{content}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export function CustomerBalanceDisplay({
  orgSlug,
  customerId,
  pendingBalance,
  supplierId,
}: CustomerBalanceDisplayProps) {
  const { data: creditResponse } = useQuery<CustomerCreditApiResponse>({
    queryKey: ["customer-credit", orgSlug, customerId, supplierId],
    queryFn: async () => {
      const supplierParam = supplierId ? `&supplierId=${supplierId}` : "";
      const response = await fetch(
        `/api/collections/customer-credit?orgSlug=${orgSlug}&customerId=${customerId}${supplierParam}`
      );

      if (!response.ok) {
        return { total: 0, enabled: false, bySupplier: [] };
      }

      return response.json();
    },
    enabled: Boolean(customerId),
  });

  const creditBalance = creditResponse?.total ?? 0;
  const showBreakdown =
    creditResponse?.enabled && (creditResponse?.bySupplier?.length ?? 0) > 1;

  const hasCredit = creditBalance > 0;
  const isInFavor = pendingBalance < 0;

  if (isInFavor) {
    return (
      <div className="text-right">
        <p className="text-green-600 text-xs">
          <span className="inline-flex items-center gap-1">
            Saldo a favor
            <InfoTooltip
              content="El cliente no tiene deudas pendientes y cuenta con un crédito disponible para futuras compras."
              label="¿Qué es saldo a favor?"
            />
          </span>
        </p>
        <p className="font-semibold text-green-600">
          {formatCurrency(Math.abs(pendingBalance))}
        </p>
      </div>
    );
  }

  if (hasCredit) {
    return (
      <div className="text-right">
        <p className="text-muted-foreground text-xs">
          <span className="inline-flex items-center gap-1">
            Pendiente
            <InfoTooltip
              content="Monto que el cliente aún tiene por pagar, incluyendo facturas vencidas y no vencidas."
              label="¿Qué es pendiente?"
            />
          </span>
        </p>
        <p className="font-semibold">{formatCurrency(pendingBalance)}</p>
        <p className="text-green-600 text-xs">
          <span className="inline-flex items-center gap-1">
            ({`Crédito: ${formatCurrency(creditBalance)}`})
            {showBreakdown && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    className="ml-0.5 h-4 w-4 p-0"
                    size="icon"
                    variant="ghost"
                  >
                    <CaretDownIcon className="size-3" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-52 p-3" side="top">
                  <div className="space-y-2">
                    <p className="font-medium text-xs">Crédito por proveedor</p>
                    <div className="space-y-1.5">
                      {creditResponse.bySupplier.map((entry) => (
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
            )}
            <span className="ml-1 inline-flex">
              <InfoTooltip
                content="Saldo a favor del cliente, generado por devoluciones o pagos en exceso, que se descuenta en futuras compras."
                label="¿Qué es crédito?"
              />
            </span>
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className="text-right">
      <p className="text-muted-foreground text-xs">
        <span className="inline-flex items-center gap-1">
          Pendiente
          <InfoTooltip
            content="Monto que el cliente aún tiene por pagar, incluyendo facturas vencidas y no vencidas."
            label="¿Qué es pendiente?"
          />
        </span>
      </p>
      <p className="font-semibold">{formatCurrency(pendingBalance)}</p>
    </div>
  );
}

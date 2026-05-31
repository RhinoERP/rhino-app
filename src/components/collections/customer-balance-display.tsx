"use client";

import { useQuery } from "@tanstack/react-query";
import { CircleHelp } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatCurrency } from "@/lib/format";

type CustomerBalanceDisplayProps = {
  orgSlug: string;
  customerId: string;
  pendingBalance: number;
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
      return data.total ?? 0;
    },
    enabled: Boolean(customerId),
  });

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
          <span>({`Crédito: ${formatCurrency(creditBalance)}`})</span>
          <span className="ml-1 inline-flex">
            <InfoTooltip
              content="Saldo a favor del cliente, generado por devoluciones o pagos en exceso, que se descuenta en futuras compras."
              label="¿Qué es crédito?"
            />
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

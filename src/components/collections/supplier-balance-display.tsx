"use client";

import { useQuery } from "@tanstack/react-query";
import { CircleHelp } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatCurrency } from "@/lib/format";

type SupplierBalanceDisplayProps = {
  orgSlug: string;
  supplierId: string;
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

export function SupplierBalanceDisplay({
  orgSlug,
  supplierId,
  pendingBalance,
}: SupplierBalanceDisplayProps) {
  const { data: creditBalance = 0 } = useQuery<number>({
    queryKey: ["supplier-credit", orgSlug, supplierId],
    queryFn: async () => {
      const response = await fetch(
        `/api/purchases/supplier-credit-balance?orgSlug=${orgSlug}&supplierId=${supplierId}`
      );

      if (!response.ok) {
        return 0;
      }

      const data = await response.json();
      return data.balance ?? 0;
    },
    enabled: Boolean(supplierId),
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
              content="No hay deudas pendientes con el proveedor y existe un crédito disponible para futuras compras."
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
              content="Monto que la empresa aún tiene por pagar al proveedor, incluyendo facturas vencidas y no vencidas."
              label="¿Qué es pendiente?"
            />
          </span>
        </p>
        <p className="font-semibold">{formatCurrency(pendingBalance)}</p>
        <p className="text-green-600 text-xs">
          <span>({`Crédito: ${formatCurrency(creditBalance)}`})</span>
          <span className="ml-1 inline-flex">
            <InfoTooltip
              content="Saldo a favor de la empresa, generado por devoluciones o pagos en exceso, que se descuenta en futuras compras."
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
            content="Monto que la empresa aún tiene por pagar al proveedor, incluyendo facturas vencidas y no vencidas."
            label="¿Qué es pendiente?"
          />
        </span>
      </p>
      <p className="font-semibold">{formatCurrency(pendingBalance)}</p>
    </div>
  );
}

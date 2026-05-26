import { ClockIcon, WarningIcon } from "@phosphor-icons/react/ssr";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatCurrency } from "@/lib/format";
import type { LiquidityAlert as LiquidityAlertType } from "@/modules/tesoreria/types";

type Props = { alert: LiquidityAlertType };

export function LiquidityAlert({ alert }: Props) {
  return (
    <Alert className="border-amber-300 bg-amber-50 text-amber-900">
      <WarningIcon className="size-4 text-amber-600" weight="duotone" />
      <AlertTitle className="flex items-center gap-2 font-semibold">
        Alerta de liquidez — Hoy{" "}
        <span className="inline-flex items-center gap-1 text-sm font-normal text-amber-700">
          <ClockIcon className="size-3.5" weight="duotone" />
          El banco debita a las 15:00 hs
        </span>
      </AlertTitle>
      <AlertDescription className="mt-1 text-sm">
        {alert.checks.length === 1
          ? "1 cheque acredita hoy"
          : `${alert.checks.length} cheques acreditan hoy`}
        . Fondos necesarios antes de las 15 hs:{" "}
        <strong className="text-amber-900">
          {formatCurrency(alert.totalAmount)}
        </strong>
        . El banco notificó a las 09:00 hs — tenés 6 horas para fondear la
        cuenta.
      </AlertDescription>
    </Alert>
  );
}

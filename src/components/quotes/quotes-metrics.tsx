"use client";

import {
  ArrowSquareOutIcon,
  CheckCircleIcon,
  ClipboardTextIcon,
  PaperPlaneTiltIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { QuoteMetrics } from "@/modules/quotes/types";

type QuotesMetricsProps = {
  metrics: QuoteMetrics;
};

export function QuotesMetrics({ metrics }: QuotesMetricsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <ClipboardTextIcon
              className="h-4 w-4 text-muted-foreground"
              weight="duotone"
            />
          </div>
          <CardTitle className="font-medium text-sm">
            Total presupuestos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">{metrics.totalQuotes}</div>
          <p className="text-muted-foreground text-xs">
            Presupuestos registrados
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <ClipboardTextIcon
              className="h-4 w-4 text-amber-500"
              weight="duotone"
            />
          </div>
          <CardTitle className="font-medium text-sm">Borradores</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">{metrics.draftCount}</div>
          <p className="text-muted-foreground text-xs">Pendientes de enviar</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <PaperPlaneTiltIcon
              className="h-4 w-4 text-blue-500"
              weight="duotone"
            />
          </div>
          <CardTitle className="font-medium text-sm">Enviados</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">{metrics.sentCount}</div>
          <p className="text-muted-foreground text-xs">Enviados al cliente</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <CheckCircleIcon
              className="h-4 w-4 text-emerald-500"
              weight="duotone"
            />
          </div>
          <CardTitle className="font-medium text-sm">Aprobados</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">{metrics.approvedCount}</div>
          <p className="text-muted-foreground text-xs">
            Aprobados por el cliente
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <ArrowSquareOutIcon
              className="h-4 w-4 text-violet-500"
              weight="duotone"
            />
          </div>
          <CardTitle className="font-medium text-sm">Convertidos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">{metrics.convertedQuotes}</div>
          <p className="text-muted-foreground text-xs">
            Convertidos a nota de venta
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <XCircleIcon className="h-4 w-4 text-rose-500" weight="duotone" />
          </div>
          <CardTitle className="font-medium text-sm">Rechazados</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">{metrics.rejectedCount}</div>
          <p className="text-muted-foreground text-xs">
            Rechazados por el cliente
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <XCircleIcon
              className="h-4 w-4 text-muted-foreground"
              weight="duotone"
            />
          </div>
          <CardTitle className="font-medium text-sm">Cancelados</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">{metrics.cancelledQuotes}</div>
          <p className="text-muted-foreground text-xs">
            Presupuestos cancelados
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

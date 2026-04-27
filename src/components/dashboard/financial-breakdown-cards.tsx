"use client";

import {
  CurrencyDollarIcon,
  ReceiptIcon,
  WalletIcon,
} from "@phosphor-icons/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { FinancialBreakdownResponse } from "@/types/dashboard";

type FinancialBreakdownCardsProps = {
  breakdown: FinancialBreakdownResponse;
};

export function FinancialBreakdownCards({
  breakdown,
}: FinancialBreakdownCardsProps) {
  const { invoicing, cashCollections } = breakdown;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <ReceiptIcon
              className="h-4 w-4 text-muted-foreground"
              weight="duotone"
            />
          </div>
          <CardTitle className="font-medium text-sm">
            Facturación por Canal
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="font-bold text-2xl">
              {formatCurrency(invoicing.total)}
            </div>
            <p className="text-muted-foreground text-xs">
              Total facturado en el periodo
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <BreakdownValue
              detail={`${invoicing.normalSalesCount} ventas`}
              label="Distribuidora"
              value={invoicing.normalSales}
            />
            <BreakdownValue
              detail={`${invoicing.directSalesCount} operaciones`}
              label="Venta directa"
              value={invoicing.directSales}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <WalletIcon
              className="h-4 w-4 text-muted-foreground"
              weight="duotone"
            />
          </div>
          <CardTitle className="font-medium text-sm">
            Cobranzas en Efectivo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="font-bold text-2xl">
              {formatCurrency(cashCollections.totalCash)}
            </div>
            <p className="text-muted-foreground text-xs">
              Dinero efectivo ingresado
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <BreakdownValue
              detail={`${cashCollections.receivablePaymentsCount} pagos`}
              label="Cuentas corrientes"
              value={cashCollections.receivableCash}
            />
            <BreakdownValue
              detail={`${cashCollections.directPaymentsCount} cobros`}
              label="Venta directa"
              value={cashCollections.directSalesCash}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function BreakdownValue({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="flex items-center gap-2">
        <CurrencyDollarIcon
          className="h-4 w-4 text-muted-foreground"
          weight="duotone"
        />
        <p className="font-medium text-sm">{label}</p>
      </div>
      <p className="mt-2 font-semibold text-lg">{formatCurrency(value)}</p>
      <p className="text-muted-foreground text-xs">{detail}</p>
    </div>
  );
}

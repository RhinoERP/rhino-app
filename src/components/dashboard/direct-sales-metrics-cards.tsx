import {
  CurrencyDollarSimpleIcon,
  ReceiptIcon,
  ShoppingBagIcon,
  WalletIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { DirectSalesCollectionsMetrics } from "@/modules/collections/types";

type DirectSalesMetricsCardsProps = {
  metrics: DirectSalesCollectionsMetrics;
};

export function DirectSalesMetricsCards({
  metrics,
}: DirectSalesMetricsCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <ShoppingBagIcon
              className="h-4 w-4 text-muted-foreground"
              weight="duotone"
            />
          </div>
          <CardTitle className="font-medium text-sm">
            Ventas directas del mes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">
            {metrics.currentMonthSalesCount}
          </div>
          <p className="text-muted-foreground text-xs">
            Operaciones de mostrador cobradas en el mes actual
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <CurrencyDollarSimpleIcon
              className="h-4 w-4 text-muted-foreground"
              weight="duotone"
            />
          </div>
          <CardTitle className="font-medium text-sm">Total vendido</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">
            {formatCurrency(metrics.currentMonthTotalAmount)}
          </div>
          <p className="text-muted-foreground text-xs">
            Importe total facturado en venta directa
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <ReceiptIcon
              className="h-4 w-4 text-muted-foreground"
              weight="duotone"
            />
          </div>
          <CardTitle className="font-medium text-sm">Ticket promedio</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">
            {formatCurrency(metrics.currentMonthAverageTicket)}
          </div>
          <p className="text-muted-foreground text-xs">
            Promedio por operación de venta directa
          </p>
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
            Cobros en efectivo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">
            {formatCurrency(metrics.currentMonthCashAmount)}
          </div>
          <p className="text-muted-foreground text-xs">
            Total cobrado en efectivo durante el mes
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

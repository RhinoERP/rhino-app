import {
  CurrencyDollarSimpleIcon,
  PercentIcon,
  UserIcon,
  UsersIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { CommissionMetrics as CommissionMetricsType } from "@/modules/commissions/types";

type CommissionMetricsProps = {
  metrics: CommissionMetricsType;
};

export function CommissionsMetrics({ metrics }: CommissionMetricsProps) {
  return (
    <div className="hidden gap-4 md:grid md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <UsersIcon
              className="h-4 w-4 text-muted-foreground"
              weight="duotone"
            />
          </div>
          <CardTitle className="font-medium text-sm">Vendedores</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">{metrics.totalSellers}</div>
          <p className="text-muted-foreground text-xs">
            Con comisiones este mes
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
          <CardTitle className="font-medium text-sm">
            Total comisionado
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">
            {formatCurrency(metrics.totalCommission)}
          </div>
          <p className="text-muted-foreground text-xs">
            {metrics.totalSales} ventas despachadas
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <PercentIcon
              className="h-4 w-4 text-muted-foreground"
              weight="duotone"
            />
          </div>
          <CardTitle className="font-medium text-sm">
            Promedio por vendedor
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">
            {formatCurrency(metrics.averageCommission)}
          </div>
          <p className="text-muted-foreground text-xs">
            Comisión promedio del mes
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <UserIcon
              className="h-4 w-4 text-muted-foreground"
              weight="duotone"
            />
          </div>
          <CardTitle className="font-medium text-sm">Total ventas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">{metrics.totalSales}</div>
          <p className="text-muted-foreground text-xs">Despachadas este mes</p>
        </CardContent>
      </Card>
    </div>
  );
}

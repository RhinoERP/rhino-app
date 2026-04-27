"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDirectSalesDashboard } from "@/modules/dashboard/hooks/use-dashboard";
import { DirectSalesCashRegistersBreakdown } from "./direct-sales-cash-registers-breakdown";
import { DirectSalesPaymentMethodsChart } from "./direct-sales-payment-methods-chart";
import { DirectSalesSummaryCards } from "./direct-sales-summary-cards";

type DirectSalesTabProps = {
  orgSlug: string;
  startDate: Date;
  endDate: Date;
};

export function DirectSalesTab({
  orgSlug,
  startDate,
  endDate,
}: DirectSalesTabProps) {
  const { data, isPending, error } = useDirectSalesDashboard(
    orgSlug,
    startDate,
    endDate
  );

  if (error) {
    return (
      <div className="text-destructive">
        Error cargando venta directa: {error.message}
      </div>
    );
  }

  if (isPending || !data) {
    return <DirectSalesSkeleton />;
  }

  return (
    <div className="space-y-6">
      <DirectSalesSummaryCards summary={data.summary} />

      <div className="grid gap-4 lg:grid-cols-2">
        <DirectSalesPaymentMethodsChart data={data.paymentMethods} />
        <DirectSalesCashRegistersBreakdown data={data.cashRegisters} />
      </div>
    </div>
  );
}

function DirectSalesSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => `direct-sales-card-${i}`).map(
          (key) => (
            <Card key={key}>
              <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
                <Skeleton className="h-8 w-8 rounded-md" />
                <Skeleton className="h-4 w-28" />
              </CardHeader>
              <CardContent>
                <Skeleton className="mb-2 h-8 w-24" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          )
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => `direct-sales-panel-${i}`).map(
          (key) => (
            <Card key={key}>
              <CardHeader>
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-56" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-80 w-full" />
              </CardContent>
            </Card>
          )
        )}
      </div>
    </div>
  );
}

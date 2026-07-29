import { CheckCircle, Receipt, TrendingUp, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { CreditNoteMetrics } from "@/modules/credit-notes/types";

type CreditNotesMetricsProps = {
  metrics: CreditNoteMetrics;
};

export function CreditNotesMetrics({ metrics }: CreditNotesMetricsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </div>
          <CardTitle className="font-medium text-sm">Total NC</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">{metrics.totalCount}</div>
          <p className="text-muted-foreground text-xs">
            Notas de crédito emitidas
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <CheckCircle className="h-4 w-4 text-green-600" />
          </div>
          <CardTitle className="font-medium text-sm">Confirmadas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">{metrics.confirmedCount}</div>
          <p className="text-muted-foreground text-xs">NC confirmadas</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <XCircle className="h-4 w-4 text-red-600" />
          </div>
          <CardTitle className="font-medium text-sm">Canceladas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">{metrics.cancelledCount}</div>
          <p className="text-muted-foreground text-xs">NC canceladas</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <TrendingUp className="h-4 w-4 text-blue-600" />
          </div>
          <CardTitle className="font-medium text-sm">Este mes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">{metrics.currentMonthCount}</div>
          <p className="text-muted-foreground text-xs">
            {formatCurrency(metrics.currentMonthAmount)} en{" "}
            {metrics.currentMonthCount} NCs
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

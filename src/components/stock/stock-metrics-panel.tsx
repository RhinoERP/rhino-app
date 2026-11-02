"use client";

import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { stockMetricsQueryOptions } from "@/modules/inventory/queries/stock-metrics.client";
import { StockMetricsCards } from "./stock-metrics";

export function StockMetricsPanel({
  orgSlug,
  accessKey,
  warehouseId,
}: {
  orgSlug: string;
  accessKey: string;
  warehouseId?: string;
}) {
  const query = useQuery(
    stockMetricsQueryOptions(orgSlug, accessKey, warehouseId)
  );
  if (query.isPending) {
    return (
      <section
        aria-label="Cargando indicadores de stock"
        className="flex flex-wrap gap-4"
      >
        {[0, 1, 2, 3].map((index) => (
          <Skeleton className="h-28 min-w-60 flex-1" key={index} />
        ))}
      </section>
    );
  }
  if (query.isError) {
    return (
      <section className="space-y-3 rounded-md border p-4">
        <p className="text-destructive text-sm" role="alert">
          {query.error.message}
        </p>
        <Button
          disabled={query.isFetching}
          onClick={() => query.refetch()}
          size="sm"
          variant="outline"
        >
          Reintentar indicadores
        </Button>
      </section>
    );
  }
  return (
    <section aria-busy={query.isFetching} className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">
          {warehouseId
            ? "Indicadores del depósito seleccionado"
            : "Indicadores de todos los depósitos accesibles"}
        </p>
        <Button
          disabled={query.isFetching}
          onClick={() => query.refetch()}
          size="sm"
          variant="ghost"
        >
          {query.isFetching ? "Actualizando..." : "Actualizar indicadores"}
        </Button>
      </div>
      <StockMetricsCards metrics={query.data} />
    </section>
  );
}

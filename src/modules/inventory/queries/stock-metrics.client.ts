import { queryOptions } from "@tanstack/react-query";
import { parseStockMetrics } from "../utils/stock-metrics-schema";
import { scopedStockMetricsQueryKey } from "./query-keys";

export function stockMetricsQueryOptions(
  orgSlug: string,
  accessKey: string,
  warehouseId?: string
) {
  return queryOptions({
    queryKey: scopedStockMetricsQueryKey(orgSlug, accessKey, warehouseId),
    queryFn: async ({ signal }) => {
      const search = warehouseId
        ? `?warehouseId=${encodeURIComponent(warehouseId)}`
        : "";
      const response = await fetch(
        `/api/org/${orgSlug}/stock/metrics${search}`,
        { signal, cache: "no-store" }
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          body?.error ?? "No se pudieron cargar los indicadores de stock"
        );
      }
      return parseStockMetrics(await response.json());
    },
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    retry: false,
  });
}

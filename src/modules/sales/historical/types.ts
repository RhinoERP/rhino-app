import type { Database } from "@/types/supabase";

export type HistoricalSalesMetric =
  Database["public"]["Tables"]["historical_sales_metrics"]["Row"];

export type HistoricalSalesMetricInsert =
  Database["public"]["Tables"]["historical_sales_metrics"]["Insert"];

export type HistoricalSalesMetricUpdate =
  Database["public"]["Tables"]["historical_sales_metrics"]["Update"];

export type ImportHistoricalSalesInput = {
  orgSlug: string;
  data: HistoricalSalesRowData[];
};

export type HistoricalSalesRowData = {
  mes: number;
  año: number;
  monto_total: number;
  cantidad_pedidos: number;
  notas?: string;
};

export type ImportHistoricalSalesResult = {
  success: boolean;
  message: string;
  imported?: number;
  updated?: number;
  errors?: string[];
};

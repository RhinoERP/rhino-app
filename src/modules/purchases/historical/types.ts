// Temporary types until migration is run and types are regenerated
// These match the structure defined in migrations/historical_purchase_metrics.sql
export type HistoricalPurchaseMetric = {
  id: string;
  organization_id: string;
  period: string;
  total_amount: number;
  total_orders: number;
  notes: string | null;
  created_at: string;
  created_by: string | null;
};

export type HistoricalPurchaseMetricInsert = {
  id?: string;
  organization_id: string;
  period: string;
  total_amount: number;
  total_orders: number;
  notes?: string | null;
  created_at?: string;
  created_by?: string | null;
};

export type HistoricalPurchaseMetricUpdate =
  Partial<HistoricalPurchaseMetricInsert>;

export type ImportHistoricalPurchasesInput = {
  orgSlug: string;
  data: HistoricalPurchaseRowData[];
};

export type HistoricalPurchaseRowData = {
  mes: number;
  año: number;
  monto_total: number;
  cantidad_ordenes: number;
  notas?: string;
};

export type ImportHistoricalPurchasesResult = {
  success: boolean;
  message: string;
  imported?: number;
  updated?: number;
  errors?: string[];
};

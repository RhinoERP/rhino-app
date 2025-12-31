/**
 * Dashboard Types - Torre de Control V2
 * Type definitions for RPC function responses
 */

// ============================================================================
// Date Range Management
// ============================================================================

export type DateRangePreset = "today" | "week" | "month" | "year" | "last30";

export type DateRange = {
  from: Date;
  to: Date;
};

// ============================================================================
// Filter Parameters
// ============================================================================

export type DashboardFilters = {
  customerId?: string | null;
  supplierId?: string | null;
};

// ============================================================================
// Control Tower KPIs (RPC: get_control_tower_kpis)
// ============================================================================

export type ControlTowerKPIsResponse = {
  sales: {
    totalAmount: number;
    totalOrders: number;
  };
  orders: {
    total: number;
    delivered: number;
    pending: number;
    delayed: number;
  };
  purchases: {
    pending: number;
  };
  stock: {
    critical: number;
  };
  customers: {
    active: number;
    inactive: number;
  };
};

// ============================================================================
// Top Performers (RPC: get_top_performers)
// ============================================================================

export type TopClient = {
  id: string;
  name: string; // business_name from SQL
  total_amount: number;
  order_count: number;
};

export type TopProduct = {
  id: string;
  name: string;
  sku: string;
  units_sold: number;
  total_amount: number;
};

export type TopPerformersResponse = {
  topClients: TopClient[];
  topProducts: TopProduct[];
};

// ============================================================================
// Stock Health Alerts (RPC: get_stock_health_alerts)
// ============================================================================

export type CriticalStockProduct = {
  id: string;
  name: string;
  sku: string;
  min_stock: number;
  current_stock: number;
  unit_stock: number;
  unit_of_measure: string;
};

export type SlowMovingProduct = {
  id: string;
  name: string;
  sku: string;
  current_stock: number;
  last_movement_date: string | null;
  days_since_movement: number | null;
};

export type ExpiringLot = {
  lot_id: string;
  lot_number: string;
  expiration_date: string;
  quantity_available: number;
  unit_quantity_available: number;
  product_id: string;
  product_name: string;
  product_sku: string;
  unit_of_measure: string;
  days_until_expiration: number;
  is_expired: boolean;
};

export type StockHealthAlertsResponse = {
  critical: CriticalStockProduct[];
  slowMoving: SlowMovingProduct[];
  expiringLots: ExpiringLot[];
};

// ============================================================================
// Financial Balance (RPC: get_financial_balance)
// ============================================================================

export type AgingBreakdown = {
  days1_7: number;
  days8_14: number;
  days15_30: number;
  days31_60: number;
  over60: number;
};

export type MarginMetrics = {
  amount: number;
  percentage: number;
};

export type FinancialBalanceResponse = {
  invoiced: number;
  collected: number;
  toCollect: number;
  toPay: number;
  aging: AgingBreakdown;
  margin: MarginMetrics;
};

// ============================================================================
// Order Status Board (RPC: get_order_status_board)
// ============================================================================

export type OrderStatusItem = {
  id: string;
  invoiceNumber: string | null;
  customerName: string;
  totalAmount: number;
  saleDate: string;
  status: string;
  daysOld: number;
};

export type OrderStatusBoardResponse = OrderStatusItem[];

// ============================================================================
// Complete Dashboard Data (aggregated)
// ============================================================================

export type TorreControlData = {
  kpis: ControlTowerKPIsResponse;
  topPerformers: TopPerformersResponse;
  stockAlerts: StockHealthAlertsResponse;
  orderBoard: OrderStatusBoardResponse;
};

export type FinancialDashboardData = {
  balance: FinancialBalanceResponse;
};

// ============================================================================
// UI State Types
// ============================================================================

export type DashboardTab = "control" | "financial" | "analytics";

export type DateRangeFilter = {
  preset: DateRangePreset;
  from: string;
  to: string;
};

// ============================================================================
// Cash Flow Projection (RPC: get_cash_flow_projection)
// ============================================================================

export type WeeklyFlowProjection = {
  week_number: number;
  week: string;
  income: number;
  expense: number;
};

export type CashFlowProjectionResponse = WeeklyFlowProjection[];

// ============================================================================
// Profitability Metrics (RPC: get_profitability_metrics)
// ============================================================================

export type ProfitabilityGroupBy = "CLIENT" | "BRAND" | "PRODUCT";

export type ProfitabilityMetric = {
  label: string;
  revenue: number;
  profit: number;
  margin_percent: number;
  order_count: number;
};

export type ProfitabilityMetricsResponse = ProfitabilityMetric[];

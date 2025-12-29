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

export type HighRotationProduct = {
  id: string;
  name: string;
  sku: string;
  movement_count: number;
  total_units_moved: number;
  current_stock: number;
};

export type StockHealthAlertsResponse = {
  critical: CriticalStockProduct[];
  slowMoving: SlowMovingProduct[];
  highRotation: HighRotationProduct[];
};

// ============================================================================
// Financial Balance (RPC: get_financial_balance)
// ============================================================================

export type AgingBreakdown = {
  current: number;
  days1_30: number;
  days31_60: number;
  days61_90: number;
  over90: number;
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
// Margins by Category (RPC: get_margins_by_category)
// ============================================================================

export type CategoryMargin = {
  category: string;
  margin: number; // Percentage
  revenue: number;
};

export type MarginsByCategoryResponse = CategoryMargin[];

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

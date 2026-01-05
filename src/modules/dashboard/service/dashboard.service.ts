/**
 * Dashboard Service - RPC-based Data Fetching
 * All heavy computation happens on the database server
 */

import { createClient } from "@/lib/supabase/server";
import type {
  CashFlowProjectionResponse,
  ControlTowerKPIsResponse,
  DashboardFilters,
  FinancialBalanceResponse,
  OrderStatusBoardResponse,
  ProfitabilityGroupBy,
  ProfitabilityMetricsResponse,
  StockHealthAlertsResponse,
  TopPerformersResponse,
} from "@/types/dashboard";

// ============================================================================
// Control Tower KPIs
// ============================================================================

export async function getControlTowerKPIs(
  organizationId: string,
  startDate: Date,
  endDate: Date,
  filters: DashboardFilters = {}
): Promise<ControlTowerKPIsResponse> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_control_tower_kpis", {
    p_org_id: organizationId,
    p_start_date: startDate.toISOString().split("T")[0],
    p_end_date: endDate.toISOString().split("T")[0],
    p_customer_id: filters.customerId || undefined,
    p_supplier_id: filters.supplierId || undefined,
  });

  if (error) {
    console.error("Error fetching control tower KPIs:", error);
    throw new Error(
      `Failed to fetch control tower KPIs: ${error.message || JSON.stringify(error)}`
    );
  }

  return data as ControlTowerKPIsResponse;
}

// ============================================================================
// Top Performers
// ============================================================================

export async function getTopPerformers(
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<TopPerformersResponse> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_top_performers", {
    p_org_id: organizationId,
    p_start_date: startDate.toISOString().split("T")[0],
    p_end_date: endDate.toISOString().split("T")[0],
  });

  if (error) {
    console.error("Error fetching top performers:", error);
    throw new Error(
      `Failed to fetch top performers: ${error.message || JSON.stringify(error)}`
    );
  }

  return data as TopPerformersResponse;
}

// ============================================================================
// Stock Health Alerts
// ============================================================================

export async function getStockHealthAlerts(
  organizationId: string,
  slowMovingDays = 90,
  filters: DashboardFilters = {}
): Promise<StockHealthAlertsResponse> {
  const supabase = await createClient();

  // Note: Signature is (p_org_id, p_supplier_id, p_slow_moving_days)
  const { data, error } = await supabase.rpc("get_stock_health_alerts", {
    p_org_id: organizationId,
    p_supplier_id: filters.supplierId || undefined,
    p_slow_moving_days: slowMovingDays,
  });

  if (error) {
    console.error("Error fetching stock health alerts:", error);
    throw new Error(
      `Failed to fetch stock health alerts: ${error.message || JSON.stringify(error)}`
    );
  }

  return data as StockHealthAlertsResponse;
}

// ============================================================================
// Financial Balance
// ============================================================================

export async function getFinancialBalance(
  organizationId: string,
  startDate: Date,
  endDate: Date,
  filters: DashboardFilters = {}
): Promise<FinancialBalanceResponse> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_financial_balance", {
    p_org_id: organizationId,
    p_start_date: startDate.toISOString().split("T")[0],
    p_end_date: endDate.toISOString().split("T")[0],
    p_customer_id: filters.customerId || undefined,
    p_supplier_id: filters.supplierId || undefined,
  });

  if (error) {
    console.error("Error fetching financial balance:", error);
    throw new Error(
      `Failed to fetch financial balance: ${error.message || JSON.stringify(error)}`
    );
  }

  return data as FinancialBalanceResponse;
}

// ============================================================================
// Order Status Board
// ============================================================================

export async function getOrderStatusBoard(
  organizationId: string,
  startDate: Date,
  endDate: Date,
  filters: DashboardFilters = {}
): Promise<OrderStatusBoardResponse> {
  const supabase = await createClient();

  // Note: Only accepts customer filter, not supplier
  const { data, error } = await supabase.rpc("get_order_status_board", {
    p_org_id: organizationId,
    p_start_date: startDate.toISOString().split("T")[0],
    p_end_date: endDate.toISOString().split("T")[0],
    p_customer_id: filters.customerId || undefined,
  });

  if (error) {
    console.error("Error fetching order status board:", error);
    throw new Error(
      `Failed to fetch order status board: ${error.message || JSON.stringify(error)}`
    );
  }

  return (data as OrderStatusBoardResponse) || [];
}

// ============================================================================
// Cash Flow Projection (NEW)
// ============================================================================

export async function getCashFlowProjection(
  organizationId: string,
  weeksLookahead = 5,
  filters: DashboardFilters = {}
): Promise<CashFlowProjectionResponse> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_cash_flow_projection", {
    p_org_id: organizationId,
    p_weeks_lookahead: weeksLookahead,
    p_customer_id: filters.customerId || undefined,
    p_supplier_id: filters.supplierId || undefined,
  });

  if (error) {
    console.error("Error fetching cash flow projection:", error);
    throw new Error(
      `Failed to fetch cash flow projection: ${error.message || JSON.stringify(error)}`
    );
  }

  return (data as CashFlowProjectionResponse) || [];
}

// ============================================================================
// Profitability Metrics
// ============================================================================

export async function getProfitabilityMetrics(
  organizationId: string,
  startDate: Date,
  endDate: Date,
  groupBy: ProfitabilityGroupBy = "CLIENT"
): Promise<ProfitabilityMetricsResponse> {
  const supabase = await createClient();

  console.log("[getProfitabilityMetrics] Calling with params:", {
    p_org_id: organizationId,
    p_date_from: startDate.toISOString(),
    p_date_to: endDate.toISOString(),
    p_group_by: groupBy,
  });

  const { data, error } = await supabase.rpc("get_profitability_metrics", {
    p_org_id: organizationId,
    p_date_from: startDate.toISOString(),
    p_date_to: endDate.toISOString(),
    p_group_by: groupBy,
  });

  if (error) {
    console.error("[getProfitabilityMetrics] Error:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw new Error(
      `Failed to fetch profitability metrics: ${error.message || JSON.stringify(error)}`
    );
  }

  console.log(
    `[getProfitabilityMetrics] Success: ${data?.length || 0} rows returned`
  );

  return data ?? [];
}

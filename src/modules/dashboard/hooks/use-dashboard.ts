/**
 * Dashboard Hooks - Torre de Control
 * Client-side React hooks for dashboard data
 */

"use client";

import { useQuery } from "@tanstack/react-query";
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
import { dashboardKeys } from "../queries/query-keys";

// ============================================================================
// Control Tower Hook
// ============================================================================

export function useControlTowerData(
  orgSlug: string,
  startDate: Date,
  endDate: Date,
  filters: DashboardFilters = {}
) {
  return useQuery<{
    kpis: ControlTowerKPIsResponse;
    topPerformers: TopPerformersResponse;
    stockAlerts: StockHealthAlertsResponse;
    orderBoard: OrderStatusBoardResponse;
    cashFlowProjection: CashFlowProjectionResponse;
  }>({
    queryKey: dashboardKeys.controlTower(
      orgSlug,
      startDate.toISOString(),
      endDate.toISOString(),
      filters
    ),
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      if (filters.customerId) {
        params.append("customerId", filters.customerId);
      }
      if (filters.supplierId) {
        params.append("supplierId", filters.supplierId);
      }

      const response = await fetch(
        `/api/org/${orgSlug}/torre-de-control/control-tower?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error(
          `Failed to fetch control tower data: ${response.status}`
        );
      }

      return response.json();
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
    refetchOnMount: false, // Don't refetch if data is already in cache
    refetchOnWindowFocus: false, // Don't refetch on window focus
  });
}

// ============================================================================
// Financial Hook
// ============================================================================

export function useFinancialData(
  orgSlug: string,
  startDate: Date,
  endDate: Date,
  filters: DashboardFilters = {}
) {
  return useQuery<{
    balance: FinancialBalanceResponse;
  }>({
    queryKey: dashboardKeys.financial(
      orgSlug,
      startDate.toISOString(),
      endDate.toISOString(),
      filters
    ),
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      if (filters.customerId) {
        params.append("customerId", filters.customerId);
      }
      if (filters.supplierId) {
        params.append("supplierId", filters.supplierId);
      }

      const response = await fetch(
        `/api/org/${orgSlug}/torre-de-control/financial?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch financial data");
      }

      return response.json();
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// ============================================================================
// Profitability Metrics Hook
// ============================================================================

export function useProfitabilityMetrics(
  orgSlug: string,
  startDate: Date,
  endDate: Date,
  groupBy: ProfitabilityGroupBy
) {
  return useQuery<ProfitabilityMetricsResponse>({
    queryKey: dashboardKeys.profitability(
      orgSlug,
      startDate.toISOString(),
      endDate.toISOString(),
      groupBy
    ),
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        groupBy,
      });

      const url = `/api/org/${orgSlug}/torre-de-control/profitability?${params.toString()}`;
      console.log("[useProfitabilityMetrics] Fetching:", url);

      const response = await fetch(url);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("[useProfitabilityMetrics] Error response:", {
          status: response.status,
          statusText: response.statusText,
          error: errorData,
        });
        throw new Error(
          errorData.error ||
            `Failed to fetch profitability metrics: ${response.status}`
        );
      }

      const data = await response.json();
      console.log(
        `[useProfitabilityMetrics] Success: ${data?.length || 0} rows`
      );
      return data;
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

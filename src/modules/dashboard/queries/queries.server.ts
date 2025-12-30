/**
 * Dashboard Query Options - Torre de Control
 * React Query query definitions for server-side and client-side data fetching
 */

"use server";

import { queryOptions } from "@tanstack/react-query";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type {
  CashFlowProjectionResponse,
  ControlTowerKPIsResponse,
  DashboardFilters,
  FinancialBalanceResponse,
  OrderStatusBoardResponse,
  StockHealthAlertsResponse,
  TopPerformersResponse,
} from "@/types/dashboard";
import {
  getCashFlowProjection,
  getControlTowerKPIs,
  getFinancialBalance,
  getOrderStatusBoard,
  getStockHealthAlerts,
  getTopPerformers,
} from "../service/dashboard.service";
import { dashboardKeys } from "./query-keys";

// ============================================================================
// Control Tower Queries
// ============================================================================

export async function controlTowerQueryOptions(
  orgSlug: string,
  startDate: Date,
  endDate: Date,
  filters: DashboardFilters = {}
) {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    throw new Error("Organization not found");
  }

  return queryOptions({
    queryKey: dashboardKeys.controlTower(
      orgSlug,
      startDate.toISOString(),
      endDate.toISOString(),
      filters
    ),
    queryFn: async (): Promise<{
      kpis: ControlTowerKPIsResponse;
      topPerformers: TopPerformersResponse;
      stockAlerts: StockHealthAlertsResponse;
      orderBoard: OrderStatusBoardResponse;
      cashFlowProjection: CashFlowProjectionResponse;
    }> => {
      const [kpis, topPerformers, stockAlerts, orderBoard, cashFlowProjection] =
        await Promise.all([
          getControlTowerKPIs(org.id, startDate, endDate, filters),
          getTopPerformers(org.id, startDate, endDate), // No filters - global data
          getStockHealthAlerts(org.id, 90, filters),
          getOrderStatusBoard(org.id, startDate, endDate, filters),
          getCashFlowProjection(org.id, 5, filters),
        ]);

      return {
        kpis,
        topPerformers,
        stockAlerts,
        orderBoard,
        cashFlowProjection,
      };
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
}

// ============================================================================
// Financial Queries
// ============================================================================

export async function financialQueryOptions(
  orgSlug: string,
  startDate: Date,
  endDate: Date,
  filters: DashboardFilters = {}
) {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    throw new Error("Organization not found");
  }

  return queryOptions({
    queryKey: dashboardKeys.financial(
      orgSlug,
      startDate.toISOString(),
      endDate.toISOString(),
      filters
    ),
    queryFn: async (): Promise<{
      balance: FinancialBalanceResponse;
    }> => {
      const balance = await getFinancialBalance(
        org.id,
        startDate,
        endDate,
        filters
      );

      return {
        balance,
      };
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

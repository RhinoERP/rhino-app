"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getSalesAdvanceAction,
  getSalesAdvanceByIdAction,
  getSalesAdvanceSuggestionAction,
  getSalesAdvanceSummaryAction,
} from "../actions/get-sales-advance.action";

export const salesAdvanceQueryKeys = {
  detail: (orgSlug: string, finalSalesOrderId: string) =>
    ["sales-advance", orgSlug, finalSalesOrderId] as const,
  byId: (orgSlug: string, advanceId: string) =>
    ["sales-advance-by-id", orgSlug, advanceId] as const,
  summary: (orgSlug: string, finalSalesOrderId: string) =>
    ["sales-advance-summary", orgSlug, finalSalesOrderId] as const,
  suggestion: (orgSlug: string, finalSalesOrderId: string) =>
    ["sales-advance-suggestion", orgSlug, finalSalesOrderId] as const,
};

export function useSalesAdvance(orgSlug: string, finalSalesOrderId: string) {
  return useQuery({
    queryKey: salesAdvanceQueryKeys.detail(orgSlug, finalSalesOrderId),
    queryFn: () => getSalesAdvanceAction(orgSlug, finalSalesOrderId),
    enabled: Boolean(orgSlug && finalSalesOrderId),
  });
}

export function useSalesAdvanceById(orgSlug: string, advanceId: string) {
  return useQuery({
    queryKey: salesAdvanceQueryKeys.byId(orgSlug, advanceId),
    queryFn: () => getSalesAdvanceByIdAction(orgSlug, advanceId),
    enabled: Boolean(orgSlug && advanceId),
  });
}

export function useSalesAdvanceSummary(
  orgSlug: string,
  finalSalesOrderId: string
) {
  return useQuery({
    queryKey: salesAdvanceQueryKeys.summary(orgSlug, finalSalesOrderId),
    queryFn: () => getSalesAdvanceSummaryAction(orgSlug, finalSalesOrderId),
    enabled: Boolean(orgSlug && finalSalesOrderId),
  });
}

export function useSalesAdvanceSuggestion(
  orgSlug: string,
  finalSalesOrderId: string
) {
  return useQuery({
    queryKey: salesAdvanceQueryKeys.suggestion(orgSlug, finalSalesOrderId),
    queryFn: () => getSalesAdvanceSuggestionAction(orgSlug, finalSalesOrderId),
    enabled: Boolean(orgSlug && finalSalesOrderId),
  });
}

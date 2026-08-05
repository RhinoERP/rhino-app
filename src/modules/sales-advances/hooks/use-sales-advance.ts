"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getSalesAdvanceAction,
  getSalesAdvanceSuggestionAction,
} from "../actions/get-sales-advance.action";

export const salesAdvanceQueryKeys = {
  detail: (orgSlug: string, finalSalesOrderId: string) =>
    ["sales-advance", orgSlug, finalSalesOrderId] as const,
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

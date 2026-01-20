import { createClient } from "@/lib/supabase/server";
import type { HistoricalSalesMetric } from "../types";

/**
 * Get historical sales metrics for an organization
 */
export async function getHistoricalSalesMetrics(
  organizationId: string,
  startDate?: Date,
  endDate?: Date
): Promise<HistoricalSalesMetric[]> {
  const supabase = await createClient();

  let query = supabase
    .from("historical_sales_metrics")
    .select("*")
    .eq("organization_id", organizationId)
    .order("period", { ascending: true });

  // Apply date filters if provided
  if (startDate) {
    query = query.gte("period", startDate.toISOString().split("T")[0]);
  }

  if (endDate) {
    query = query.lte("period", endDate.toISOString().split("T")[0]);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(
      `Failed to fetch historical sales metrics: ${error.message}`
    );
  }

  return data || [];
}

import { createClient } from "@/lib/supabase/server";
import type { HistoricalPurchaseMetric } from "../types";

/**
 * Get historical purchase metrics for an organization
 */
export async function getHistoricalPurchaseMetrics(
  organizationId: string,
  startDate?: Date,
  endDate?: Date
): Promise<HistoricalPurchaseMetric[]> {
  const supabase = await createClient();

  let query = supabase
    .from("historical_purchase_metrics")
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
      `Failed to fetch historical purchase metrics: ${error.message}`
    );
  }

  return data || [];
}

"use server";

import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { QuoteMetrics } from "../types";

export async function getQuoteMetricsAction(
  orgSlug: string,
  customerId: string
): Promise<QuoteMetrics> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    return {
      totalQuotes: 0,
      draftCount: 0,
      sentCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      convertedQuotes: 0,
      cancelledQuotes: 0,
    };
  }

  const supabase = await createClient();

  const { data } = await supabase
    .from("quotes")
    .select("status")
    .eq("organization_id", org.id)
    .eq("customer_id", customerId);

  const quotes = data ?? [];
  const totalQuotes = quotes.length;

  return {
    totalQuotes,
    draftCount: quotes.filter((q) => q.status === "DRAFT").length,
    sentCount: quotes.filter((q) => q.status === "SENT").length,
    approvedCount: quotes.filter((q) => q.status === "APPROVED").length,
    rejectedCount: quotes.filter((q) => q.status === "REJECTED").length,
    convertedQuotes: quotes.filter((q) => q.status === "CONVERTED").length,
    cancelledQuotes: quotes.filter((q) => q.status === "CANCELLED").length,
  };
}

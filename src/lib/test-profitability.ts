/**
 * Quick test to call the profitability function directly from Supabase
 * Run this in your browser console or as a standalone script
 */

import { createClient } from "@/lib/supabase/server";

// You can run this in a server component or API route to test
export async function testProfitabilityFunction() {
  const supabase = await createClient();

  // Get your organization ID first
  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, slug")
    .limit(1);

  if (!orgs || orgs.length === 0) {
    console.error("No organizations found");
    return;
  }

  const orgId = orgs[0].id;
  console.log("Testing with org:", orgs[0]);

  // Test the function
  const { data, error } = await supabase.rpc("get_profitability_metrics", {
    p_org_id: orgId,
    p_date_from: new Date("2024-01-01").toISOString(),
    p_date_to: new Date().toISOString(),
    p_group_by: "CLIENT",
  });

  if (error) {
    console.error("Function error:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    return;
  }

  console.log("Function success:", {
    rowCount: data?.length || 0,
    data,
  });

  return data;
}

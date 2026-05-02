/**
 * Customers API Route
 * Get list of customers for dashboard filters
 */

import { NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orgSlug: string }> }
) {
  try {
    const auth = await requireAuthResponse();
    if (auth) {
      return auth;
    }
    const { orgSlug } = await params;

    const org = await getOrganizationBySlug(orgSlug);
    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const supabase = await createClient();

    // Get customers that have at least one sale_order in the organization
    const { data: customers, error } = await supabase
      .from("customers")
      .select(`
        id, 
        business_name,
        sales_orders!inner(id)
      `)
      .eq("organization_id", org.id)
      .eq("is_active", true)
      .order("business_name");

    if (error) {
      console.error("Error fetching customers:", error);
      return NextResponse.json(
        { error: "Failed to fetch customers" },
        { status: 500 }
      );
    }

    // Remove duplicates and sales_orders from the response
    const uniqueCustomers = Array.from(
      new Map(
        (customers || []).map((c) => [
          c.id,
          { id: c.id, business_name: c.business_name },
        ])
      ).values()
    );

    return NextResponse.json(uniqueCustomers);
  } catch (error) {
    console.error("Error in customers API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

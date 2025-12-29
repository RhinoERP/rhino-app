/**
 * Customers API Route
 * Get list of customers for dashboard filters
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const orgSlug = searchParams.get("orgSlug");

    if (!orgSlug) {
      return NextResponse.json(
        { error: "Missing orgSlug parameter" },
        { status: 400 }
      );
    }

    const org = await getOrganizationBySlug(orgSlug);
    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const supabase = await createClient();

    // Get active customers with at least one sale
    const { data: customers, error } = await supabase
      .from("customers")
      .select("id, name")
      .eq("organization_id", org.id)
      .eq("active", true)
      .order("name");

    if (error) {
      console.error("Error fetching customers:", error);
      return NextResponse.json(
        { error: "Failed to fetch customers" },
        { status: 500 }
      );
    }

    return NextResponse.json(customers || []);
  } catch (error) {
    console.error("Error in customers API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

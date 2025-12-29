/**
 * Suppliers API Route
 * Get list of suppliers for dashboard filters
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

    // Get active suppliers
    const { data: suppliers, error } = await supabase
      .from("suppliers")
      .select("id, name")
      .eq("organization_id", org.id)
      .eq("active", true)
      .order("name");

    if (error) {
      console.error("Error fetching suppliers:", error);
      return NextResponse.json(
        { error: "Failed to fetch suppliers" },
        { status: 500 }
      );
    }

    return NextResponse.json(suppliers || []);
  } catch (error) {
    console.error("Error in suppliers API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

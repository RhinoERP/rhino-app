/**
 * Suppliers API Route
 * Get list of suppliers for dashboard filters
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orgSlug: string }> }
) {
  try {
    const { orgSlug } = await params;

    const org = await getOrganizationBySlug(orgSlug);
    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const supabase = await createClient();

    // Get suppliers that have at least one purchase_order in the organization
    const { data: suppliers, error } = await supabase
      .from("suppliers")
      .select(`
        id, 
        name,
        purchase_orders!inner(id)
      `)
      .eq("organization_id", org.id)
      .eq("is_active", true)
      .order("name");

    if (error) {
      console.error("Error fetching suppliers:", error);
      return NextResponse.json(
        { error: "Failed to fetch suppliers" },
        { status: 500 }
      );
    }

    // Remove duplicates and purchase_orders from the response
    const uniqueSuppliers = Array.from(
      new Map(
        (suppliers || []).map((s) => [s.id, { id: s.id, name: s.name }])
      ).values()
    );

    return NextResponse.json(uniqueSuppliers);
  } catch (error) {
    console.error("Error in suppliers API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

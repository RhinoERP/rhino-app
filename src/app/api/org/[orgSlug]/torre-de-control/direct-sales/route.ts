/**
 * Direct Sales API Route
 * Client-side data fetching for dashboard direct sales tab
 */

import { NextResponse } from "next/server";
import { getDirectSalesDashboard } from "@/modules/dashboard/service/dashboard.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orgSlug: string }> }
) {
  try {
    const { orgSlug } = await params;
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (!(startDate && endDate)) {
      return NextResponse.json(
        { error: "Missing required parameters" },
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

    const data = await getDirectSalesDashboard(
      org.id,
      new Date(startDate),
      new Date(endDate)
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching direct sales dashboard:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

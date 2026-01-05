/**
 * Profitability Metrics API Route
 * Returns profitability data grouped by client, brand, or product
 */

import { NextResponse } from "next/server";
import { getProfitabilityMetrics } from "@/modules/dashboard/service/dashboard.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { ProfitabilityGroupBy } from "@/types/dashboard";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ orgSlug: string }> }
) {
  try {
    const { orgSlug } = await params;
    const { searchParams } = new URL(req.url);

    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");
    const groupByParam =
      (searchParams.get("groupBy") as ProfitabilityGroupBy) || "CLIENT";

    if (!(startDateParam && endDateParam)) {
      return NextResponse.json(
        { error: "Missing required date parameters" },
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

    const startDate = new Date(startDateParam);
    const endDate = new Date(endDateParam);

    // Validate dates
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return NextResponse.json({ error: "Invalid dates" }, { status: 400 });
    }

    // Validate groupBy
    if (!["CLIENT", "BRAND", "PRODUCT"].includes(groupByParam)) {
      return NextResponse.json(
        {
          error: "Invalid groupBy parameter. Must be CLIENT, BRAND, or PRODUCT",
        },
        { status: 400 }
      );
    }

    const data = await getProfitabilityMetrics(
      org.id,
      startDate,
      endDate,
      groupByParam
    );

    console.log(
      `[Profitability API] Success for org ${org.id}, groupBy: ${groupByParam}, results: ${data?.length || 0}`
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching profitability metrics:", error);
    console.error("Error details:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch profitability metrics",
      },
      { status: 500 }
    );
  }
}

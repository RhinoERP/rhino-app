import { NextResponse } from "next/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { getHistoricalSalesMetrics } from "@/modules/sales/historical/service/queries.service";

type RouteParams = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { orgSlug } = await params;
    const { searchParams } = new URL(request.url);

    // Parse optional date filters
    const startDateStr = searchParams.get("startDate");
    const endDateStr = searchParams.get("endDate");

    const startDate = startDateStr ? new Date(startDateStr) : undefined;
    const endDate = endDateStr ? new Date(endDateStr) : undefined;

    // Get organization
    const org = await getOrganizationBySlug(orgSlug);
    if (!org?.id) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    // Fetch historical sales metrics
    const metrics = await getHistoricalSalesMetrics(org.id, startDate, endDate);

    console.log("📊 Historical Sales API Response:", {
      orgSlug,
      orgId: org.id,
      startDate: startDate?.toISOString(),
      endDate: endDate?.toISOString(),
      metricsCount: metrics.length,
      firstRecord: metrics[0],
    });

    return NextResponse.json(metrics);
  } catch (error) {
    console.error("Error fetching historical sales metrics:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch historical sales metrics",
      },
      { status: 500 }
    );
  }
}

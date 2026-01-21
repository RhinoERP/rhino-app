import { NextResponse } from "next/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { getHistoricalPurchaseMetrics } from "@/modules/purchases/historical/service/queries.service";

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

    // Fetch historical purchase metrics
    const metrics = await getHistoricalPurchaseMetrics(
      org.id,
      startDate,
      endDate
    );

    return NextResponse.json(metrics);
  } catch (error) {
    console.error("Error fetching historical purchase metrics:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch historical purchase metrics",
      },
      { status: 500 }
    );
  }
}

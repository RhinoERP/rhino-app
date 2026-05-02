/**
 * Customer Profitability API Route
 * Returns KPIs, top customers and ordered detail rows for the selected date range.
 */

import { NextResponse } from "next/server";
import { getCustomerProfitabilityDashboard } from "@/modules/dashboard/service/dashboard.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ orgSlug: string }> }
) {
  const requestId = crypto.randomUUID();
  let orgSlug: string | undefined;
  let startDateParam: string | null = null;
  let endDateParam: string | null = null;

  try {
    ({ orgSlug } = await params);
    const { searchParams } = new URL(req.url);
    startDateParam = searchParams.get("startDate");
    endDateParam = searchParams.get("endDate");

    if (!(startDateParam && endDateParam)) {
      return NextResponse.json(
        { error: "Missing required date parameters" },
        { status: 400 }
      );
    }

    const startDate = new Date(startDateParam);
    const endDate = new Date(endDateParam);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid dates. Use ISO 8601 values." },
        { status: 400 }
      );
    }

    if (startDate.getTime() > endDate.getTime()) {
      return NextResponse.json(
        { error: "startDate must be before or equal to endDate" },
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

    const data = await getCustomerProfitabilityDashboard(
      org.id,
      startDate,
      endDate
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error("[api:customer-profitability] Failed to calculate metrics", {
      requestId,
      orgSlug,
      startDate: startDateParam,
      endDate: endDateParam,
      message: getErrorMessage(error),
      stack: error instanceof Error ? error.stack : undefined,
      cause: error instanceof Error ? error.cause : undefined,
    });

    return NextResponse.json(
      {
        error: "Failed to fetch customer profitability metrics",
        requestId,
      },
      { status: 500 }
    );
  }
}

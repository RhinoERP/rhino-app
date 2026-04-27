/**
 * Profitability Metrics API Route
 * Returns profitability data grouped by client, brand, or product
 */

import { NextResponse } from "next/server";
import { getProfitabilityMetrics } from "@/modules/dashboard/service/dashboard.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { ProfitabilityGroupBy } from "@/types/dashboard";

const validGroupByValues: ProfitabilityGroupBy[] = [
  "CLIENT",
  "BRAND",
  "PRODUCT",
];

function isValidGroupBy(value: string): value is ProfitabilityGroupBy {
  return validGroupByValues.includes(value as ProfitabilityGroupBy);
}

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
  let groupByParam: string | null = null;

  try {
    ({ orgSlug } = await params);
    const { searchParams } = new URL(req.url);

    startDateParam = searchParams.get("startDate");
    endDateParam = searchParams.get("endDate");
    groupByParam = searchParams.get("groupBy") || "CLIENT";

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
      return NextResponse.json(
        {
          error:
            "Invalid dates. Use ISO 8601 values, e.g. 2026-04-01T00:00:00.000Z",
        },
        { status: 400 }
      );
    }

    if (startDate.getTime() > endDate.getTime()) {
      return NextResponse.json(
        { error: "startDate must be before or equal to endDate" },
        { status: 400 }
      );
    }

    // Validate groupBy
    if (!isValidGroupBy(groupByParam)) {
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

    return NextResponse.json(data);
  } catch (error) {
    console.error("[api:profitability] Failed to calculate profitability", {
      requestId,
      orgSlug,
      startDate: startDateParam,
      endDate: endDateParam,
      groupBy: groupByParam,
      message: getErrorMessage(error),
      stack: error instanceof Error ? error.stack : undefined,
      cause: error instanceof Error ? error.cause : undefined,
    });

    return NextResponse.json(
      {
        error: "Failed to fetch profitability metrics",
        requestId,
      },
      { status: 500 }
    );
  }
}

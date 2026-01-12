/**
 * Control Tower API Route
 * Client-side data fetching for dashboard control tower tab
 */

import { NextResponse } from "next/server";
import {
  getCashFlowProjection,
  getControlTowerKPIs,
  getOrderStatusBoard,
  getStockHealthAlerts,
  getTopPerformers,
} from "@/modules/dashboard/service/dashboard.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { DashboardFilters } from "@/types/dashboard";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orgSlug: string }> }
) {
  try {
    const { orgSlug } = await params;
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const customerId = searchParams.get("customerId");
    const supplierId = searchParams.get("supplierId");

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

    const filters: DashboardFilters = {
      customerId: customerId || null,
      supplierId: supplierId || null,
    };

    const start = new Date(startDate);
    const end = new Date(endDate);

    const [kpis, topPerformers, stockAlerts, orderBoard, cashFlowProjection] =
      await Promise.all([
        getControlTowerKPIs(org.id, start, end, filters),
        getTopPerformers(org.id, start, end),
        getStockHealthAlerts(org.id, 90, filters),
        getOrderStatusBoard(org.id, start, end, filters),
        getCashFlowProjection(org.id, 5, filters),
      ]);

    return NextResponse.json({
      kpis,
      topPerformers,
      stockAlerts,
      orderBoard,
      cashFlowProjection,
    });
  } catch (error) {
    console.error("Error fetching control tower data:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

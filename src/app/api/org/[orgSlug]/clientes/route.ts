import { type NextRequest, NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/supabase/auth";
import {
  type CustomerStatusFilter,
  getVisibleCustomersByOrgSlug,
} from "@/modules/customers/service/customers.service";

type RouteContext = {
  params: Promise<{ orgSlug: string }>;
};

const isCustomerStatusFilter = (
  value: string | null
): value is CustomerStatusFilter =>
  value === "active" || value === "archived" || value === "all";

export async function GET(request: NextRequest, context: RouteContext) {
  const authError = await requireAuthResponse();
  if (authError) {
    return authError;
  }

  try {
    const { orgSlug } = await context.params;
    const statusParam = request.nextUrl.searchParams.get("status");
    const status = isCustomerStatusFilter(statusParam) ? statusParam : "active";
    const visibleCustomers = await getVisibleCustomersByOrgSlug(
      orgSlug,
      status
    );
    return NextResponse.json(visibleCustomers);
  } catch (error) {
    console.error("Error fetching customers:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Error interno del servidor",
      },
      { status: 500 }
    );
  }
}

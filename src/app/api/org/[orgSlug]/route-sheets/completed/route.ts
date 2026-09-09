import { type NextRequest, NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/supabase/auth";
import { searchCompletedRouteSheets } from "@/modules/route-sheets/service/route-sheets.service";
import { getSalesAccessContext } from "@/modules/sales/service/sales.service";

type RouteContext = {
  params: Promise<{ orgSlug: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const authError = await requireAuthResponse();
  if (authError) {
    return authError;
  }

  try {
    const { orgSlug } = await context.params;

    const accessContext = await getSalesAccessContext(orgSlug);
    if (!accessContext.canRead) {
      return NextResponse.json(
        { error: "No tienes permisos para ver hojas de ruta" },
        { status: 403 }
      );
    }

    const { searchParams } = request.nextUrl;
    const routeSheets = await searchCompletedRouteSheets({
      orgSlug,
      dateFrom: searchParams.get("dateFrom"),
      dateTo: searchParams.get("dateTo"),
      carrierId: searchParams.get("carrierId"),
      saleNumber: searchParams.get("saleNumber"),
    });

    return NextResponse.json({ routeSheets });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Error interno del servidor",
      },
      { status: 500 }
    );
  }
}

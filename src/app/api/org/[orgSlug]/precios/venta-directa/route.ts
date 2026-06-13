import { NextResponse } from "next/server";
import { getDirectSalePricingGridData } from "@/modules/inventory/service/pricing-grid.service";

type RouteParams = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { orgSlug } = await params;
    const data = await getDirectSalePricingGridData(orgSlug);
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error al obtener precios de venta directa",
      },
      { status: 500 }
    );
  }
}

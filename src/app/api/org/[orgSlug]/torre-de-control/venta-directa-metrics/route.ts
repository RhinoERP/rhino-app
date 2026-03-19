import { NextResponse } from "next/server";
import { getDirectSalesCollectionsMetrics } from "@/modules/collections/service/collections.service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orgSlug: string }> }
) {
  try {
    const { orgSlug } = await params;
    const metrics = await getDirectSalesCollectionsMetrics(orgSlug);

    return NextResponse.json(metrics);
  } catch (error) {
    console.error(
      "Error fetching direct sales metrics for control tower:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error interno obteniendo métricas de venta directa",
      },
      { status: 500 }
    );
  }
}

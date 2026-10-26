import { type NextRequest, NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/supabase/auth";
import { getStockMovementsForProduct } from "@/modules/inventory/service/inventory.service";

type RouteContext = {
  params: Promise<{ orgSlug: string; productId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const authError = await requireAuthResponse();
  if (authError) {
    return authError;
  }

  try {
    const { orgSlug, productId } = await context.params;
    const searchParams = request.nextUrl.searchParams;
    const lotId = searchParams.get("lotId") ?? undefined;
    const rawLimit = searchParams.get("limit");
    const limit = rawLimit ? Number.parseInt(rawLimit, 10) : 50;

    if (rawLimit && !Number.isFinite(limit)) {
      return NextResponse.json({ error: "Limit inválido" }, { status: 400 });
    }

    const movements = await getStockMovementsForProduct(
      orgSlug,
      productId,
      limit,
      lotId
    );
    return NextResponse.json(movements);
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

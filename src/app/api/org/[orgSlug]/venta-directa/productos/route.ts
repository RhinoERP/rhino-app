import { type NextRequest, NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/supabase/auth";
import { searchPosProductsForTerminal } from "@/modules/pos/service/pos.service";

type RouteContext = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const authError = await requireAuthResponse();

  if (authError) {
    return authError;
  }

  try {
    const { orgSlug } = await context.params;
    const q = request.nextUrl.searchParams.get("q") ?? "";
    const limitParam = request.nextUrl.searchParams.get("limit");
    const parsedLimit = Number(limitParam);

    const products = await searchPosProductsForTerminal({
      orgSlug,
      q,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    });

    return NextResponse.json(products);
  } catch (error) {
    console.error("Error fetching POS products:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error al obtener productos para la caja",
      },
      { status: 500 }
    );
  }
}

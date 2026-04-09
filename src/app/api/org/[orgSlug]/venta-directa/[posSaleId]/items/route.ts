import { type NextRequest, NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/supabase/auth";
import { getPosSaleReturnableItems } from "@/modules/sales-returns/service/sales-returns.service";

type RouteContext = {
  params: Promise<{
    orgSlug: string;
    posSaleId: string;
  }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const authError = await requireAuthResponse();

  if (authError) {
    return authError;
  }

  try {
    const { orgSlug, posSaleId } = await context.params;

    const result = await getPosSaleReturnableItems({
      orgSlug,
      posSaleId,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching POS returnable items:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error obteniendo ítems retornables de la venta POS.",
      },
      { status: 500 }
    );
  }
}

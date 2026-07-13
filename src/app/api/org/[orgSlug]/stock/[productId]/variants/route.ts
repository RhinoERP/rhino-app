import { type NextRequest, NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/supabase/auth";
import { getProductVariantsWithStock } from "@/modules/inventory/service/inventory.service";

type RouteContext = {
  params: Promise<{ orgSlug: string; productId: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const authError = await requireAuthResponse();
  if (authError) {
    return authError;
  }

  try {
    const { orgSlug, productId } = await context.params;
    const variants = await getProductVariantsWithStock(orgSlug, productId);
    return NextResponse.json(variants);
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

import { type NextRequest, NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/supabase/auth";
import { getActiveTaxesByOrgSlug } from "@/modules/taxes/service/taxes.service";

type RouteContext = {
  params: Promise<{ orgSlug: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const authError = await requireAuthResponse();
  if (authError) {
    return authError;
  }

  try {
    const { orgSlug } = await context.params;
    const taxes = await getActiveTaxesByOrgSlug(orgSlug);
    return NextResponse.json(taxes);
  } catch (error) {
    console.error("Error fetching taxes:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Error interno del servidor",
      },
      { status: 500 }
    );
  }
}

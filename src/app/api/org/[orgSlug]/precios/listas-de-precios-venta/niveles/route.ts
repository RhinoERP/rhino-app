import { NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/supabase/auth";
import { getPriceLevelsByOrgSlug } from "@/modules/price-levels/service/price-levels.service";

type RouteParams = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const authError = await requireAuthResponse();
    if (authError) {
      return authError;
    }

    const { orgSlug } = await params;
    const priceLevels = await getPriceLevelsByOrgSlug(orgSlug);
    return NextResponse.json(priceLevels);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/supabase/auth";
import { getSalesPriceListsByOrgSlug } from "@/modules/sales-price-lists/service/sales-price-lists.service";

type RouteParams = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export async function GET(_request: Request, { params }: RouteParams) {
  const authError = await requireAuthResponse();
  if (authError) {
    return authError;
  }
  try {
    const { orgSlug } = await params;
    const priceLists = await getSalesPriceListsByOrgSlug(orgSlug);
    return NextResponse.json(priceLists);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

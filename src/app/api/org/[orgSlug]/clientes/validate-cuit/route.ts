import { type NextRequest, NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/supabase/auth";
import { toArcaUserMessage } from "@/modules/arca/errors";
import { lookupCustomerTaxpayerByCuit } from "@/modules/arca/server/taxpayer-lookup.service";

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
    const cuit = request.nextUrl.searchParams.get("cuit");
    const result = await lookupCustomerTaxpayerByCuit(orgSlug, cuit ?? "");

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error validating customer CUIT:", error);
    return NextResponse.json(
      {
        error: toArcaUserMessage(error),
      },
      { status: 400 }
    );
  }
}

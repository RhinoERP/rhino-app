import { type NextRequest, NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/supabase/auth";
import { fetchSuggestedUsdQuote } from "@/lib/usd-quote";

export async function GET(_request: NextRequest) {
  const authError = await requireAuthResponse();
  if (authError) {
    return authError;
  }

  try {
    const rate = await fetchSuggestedUsdQuote();
    return NextResponse.json(rate);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error al obtener la cotización";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { type NextRequest, NextResponse } from "next/server";

import { requireAuthResponse } from "@/lib/supabase/auth";
import { getActiveTaxes } from "@/modules/taxes/service/taxes.service";

export async function GET(_request: NextRequest) {
  const authError = await requireAuthResponse();

  if (authError) {
    return authError;
  }

  try {
    const taxes = await getActiveTaxes();
    return NextResponse.json(taxes);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error obteniendo impuestos";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { type NextRequest, NextResponse } from "next/server";

import { requireAuthResponse } from "@/lib/supabase/auth";
import { getSuppliersByOrgSlug } from "@/modules/suppliers/service/suppliers.service";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ orgSlug: string }> }
) {
  const authError = await requireAuthResponse();

  if (authError) {
    return authError;
  }

  try {
    const { orgSlug } = await context.params;
    const suppliers = await getSuppliersByOrgSlug(orgSlug);
    return NextResponse.json(suppliers);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error obteniendo proveedores";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

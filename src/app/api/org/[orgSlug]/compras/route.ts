import { type NextRequest, NextResponse } from "next/server";

import { requireAuthResponse } from "@/lib/supabase/auth";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";
import { getPurchaseOrdersByOrgSlug } from "@/modules/purchases/service/purchases.service";

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
    await guardOrganizationPermissionAccess(orgSlug, "purchases.read");
    const purchases = await getPurchaseOrdersByOrgSlug(orgSlug);
    return NextResponse.json(purchases);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error obteniendo compras";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

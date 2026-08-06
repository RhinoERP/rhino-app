import { type NextRequest, NextResponse } from "next/server";

import { requireAuthResponse } from "@/lib/supabase/auth";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";
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
    await guardOrganizationPermissionAccess(orgSlug, "suppliers.manage");
    const suppliers = await getSuppliersByOrgSlug(orgSlug);
    return NextResponse.json(suppliers);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error obteniendo proveedores";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

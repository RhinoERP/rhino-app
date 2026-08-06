import { type NextRequest, NextResponse } from "next/server";

import { requireAuthResponse } from "@/lib/supabase/auth";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";
import {
  getSalesAccessContext,
  getSalesOrdersByOrgSlug,
} from "@/modules/sales/service/sales.service";

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

    await guardOrganizationPermissionAccess(orgSlug, [
      "sales.read",
      "sales.read.all",
      "sales.manage",
      "sales.manage.all",
    ]);

    const accessContext = await getSalesAccessContext(orgSlug);
    if (!accessContext.canRead) {
      return NextResponse.json(
        { error: "No tienes permisos para ver ventas" },
        { status: 403 }
      );
    }

    const sales = await getSalesOrdersByOrgSlug(orgSlug);
    return NextResponse.json(sales);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error obteniendo ventas";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

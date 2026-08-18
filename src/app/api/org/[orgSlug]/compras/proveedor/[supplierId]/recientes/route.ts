import { type NextRequest, NextResponse } from "next/server";

import { requireAuthResponse } from "@/lib/supabase/auth";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";
import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";
import { getRecentPurchaseOrdersBySupplier } from "@/modules/purchases/service/purchases.service";

export async function GET(
  _request: NextRequest,
  context: {
    params: Promise<{ orgSlug: string; supplierId: string }>;
  }
) {
  const authError = await requireAuthResponse();

  if (authError) {
    return authError;
  }

  try {
    const { orgSlug, supplierId } = await context.params;
    await guardOrganizationPermissionAccess(
      orgSlug,
      READ_PERMISSIONS.purchases
    );
    const purchases = await getRecentPurchaseOrdersBySupplier(
      orgSlug,
      supplierId,
      3
    );
    return NextResponse.json(purchases);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Error obteniendo compras recientes";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

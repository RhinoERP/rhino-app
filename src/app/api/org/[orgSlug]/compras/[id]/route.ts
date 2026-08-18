import { type NextRequest, NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/supabase/auth";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";
import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";
import { getPurchaseOrderWithItems } from "@/modules/purchases/service/purchases.service";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ orgSlug: string; id: string }> }
) {
  const authError = await requireAuthResponse();

  if (authError) {
    return authError;
  }

  try {
    const { orgSlug, id } = await context.params;
    await guardOrganizationPermissionAccess(
      orgSlug,
      READ_PERMISSIONS.purchases
    );
    const purchaseOrder = await getPurchaseOrderWithItems(orgSlug, id);
    return NextResponse.json(purchaseOrder);
  } catch (error) {
    console.error("Error fetching purchase order:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error al obtener la orden de compra",
      },
      { status: 500 }
    );
  }
}

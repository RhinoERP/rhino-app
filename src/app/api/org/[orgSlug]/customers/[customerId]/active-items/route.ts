import { NextResponse } from "next/server";
import { getCustomerActiveItems } from "@/modules/customers/service/customers.service";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";
import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";

export async function GET(
  _request: Request,
  context: { params: Promise<{ orgSlug: string; customerId: string }> }
) {
  try {
    const { orgSlug, customerId } = await context.params;

    await guardOrganizationPermissionAccess(
      orgSlug,
      READ_PERMISSIONS.customers
    );
    const activeItems = await getCustomerActiveItems(orgSlug, customerId);

    return NextResponse.json(activeItems);
  } catch (error) {
    console.error("Error fetching customer active items:", error);
    return NextResponse.json(
      { error: "Failed to fetch customer active items" },
      { status: 500 }
    );
  }
}

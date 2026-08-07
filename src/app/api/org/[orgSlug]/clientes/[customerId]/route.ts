import { type NextRequest, NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/supabase/auth";
import { getCustomerById } from "@/modules/customers/service/customers.service";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";

type RouteContext = {
  params: Promise<{ orgSlug: string; customerId: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const authError = await requireAuthResponse();
  if (authError) {
    return authError;
  }

  try {
    const { orgSlug, customerId } = await context.params;
    await guardOrganizationPermissionAccess(orgSlug, "customers.manage");
    const customer = await getCustomerById(customerId);

    if (!customer) {
      return NextResponse.json(
        { error: "Cliente no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json(customer);
  } catch (error) {
    console.error("Error fetching customer:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Error interno del servidor",
      },
      { status: 500 }
    );
  }
}

import { type NextRequest, NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/supabase/auth";
import { getCustomersByOrgSlug } from "@/modules/customers/service/customers.service";

type RouteContext = {
  params: Promise<{ orgSlug: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const authError = await requireAuthResponse();
  if (authError) {
    return authError;
  }

  try {
    const { orgSlug } = await context.params;
    const customers = await getCustomersByOrgSlug(orgSlug);
    return NextResponse.json(customers);
  } catch (error) {
    console.error("Error fetching customers:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Error interno del servidor",
      },
      { status: 500 }
    );
  }
}

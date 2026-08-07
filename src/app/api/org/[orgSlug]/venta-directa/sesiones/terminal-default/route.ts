import { type NextRequest, NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/supabase/auth";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";
import { getDefaultOpenPosTerminalForDirectSale } from "@/modules/pos/service/pos-sessions.service";

type RouteContext = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const authError = await requireAuthResponse();

  if (authError) {
    return authError;
  }

  try {
    const { orgSlug } = await context.params;
    await guardOrganizationPermissionAccess(orgSlug, "pos.manage");

    const defaultOpenTerminal =
      await getDefaultOpenPosTerminalForDirectSale(orgSlug);

    return NextResponse.json(defaultOpenTerminal);
  } catch (error) {
    console.error("Error fetching default open POS terminal:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error al obtener la terminal abierta predeterminada",
      },
      { status: 500 }
    );
  }
}

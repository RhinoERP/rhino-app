import { type NextRequest, NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/supabase/auth";
import { getPosTerminalsByOrgSlug } from "@/modules/pos/service/pos-terminals.service";

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
    const terminals = await getPosTerminalsByOrgSlug(orgSlug);

    return NextResponse.json(terminals);
  } catch (error) {
    console.error("Error fetching POS terminals:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error al obtener terminales POS",
      },
      { status: 500 }
    );
  }
}

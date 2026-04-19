import { type NextRequest, NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/supabase/auth";
import { getOrgSettings } from "@/modules/organizations/service/org-settings.service";

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
    const settings = await getOrgSettings(orgSlug);
    return NextResponse.json(settings);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Error interno del servidor",
      },
      { status: 500 }
    );
  }
}

import { revalidatePath } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/supabase/auth";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";
import { ClosePosSessionValidationError } from "@/modules/pos/service/close-pos-session.rules";
import { closePosSession } from "@/modules/pos/service/pos-sessions.service";

type RouteContext = {
  params: Promise<{
    orgSlug: string;
    sessionId: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const authError = await requireAuthResponse();

  if (authError) {
    return authError;
  }

  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Datos inválidos para cerrar la sesión de caja." },
      { status: 400 }
    );
  }

  try {
    const { orgSlug, sessionId } = await context.params;
    await guardOrganizationPermissionAccess(orgSlug, "pos.manage");

    const closedSession = await closePosSession({
      orgSlug,
      sessionId,
      realCashEnd: body.realCashEnd as number,
      notes: body.notes as string | null | undefined,
      description: body.description as string | null | undefined,
    });

    revalidatePath(`/org/${orgSlug}/venta-directa`);
    revalidatePath(`/org/${orgSlug}/venta-directa/nueva`);

    return NextResponse.json({
      success: true,
      session: closedSession,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Error desconocido al cerrar la sesión de caja.";

    if (error instanceof ClosePosSessionValidationError) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    console.error("Error closing POS session from API route:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/supabase/auth";
import { getCreditNoteById } from "@/modules/credit-notes/service/credit-notes.service";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";
import { getOrganizationLayoutData } from "@/modules/organizations/service/organizations.service";

type RouteContext = {
  params: Promise<{ orgSlug: string; creditNoteId: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const auth = await requireAuthResponse();
    if (auth) {
      return auth;
    }

    const { orgSlug, creditNoteId } = await params;
    await guardOrganizationPermissionAccess(orgSlug, "creditnotes.manage");

    const layoutData = await getOrganizationLayoutData(orgSlug);

    if (!layoutData?.permissions.includes("creditnotes.read")) {
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
    }

    const data = await getCreditNoteById(orgSlug, creditNoteId);

    if (!data) {
      return NextResponse.json(
        { error: "Nota de crédito no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error" },
      { status: 500 }
    );
  }
}

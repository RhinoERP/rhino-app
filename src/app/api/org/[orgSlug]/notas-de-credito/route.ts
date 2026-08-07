import { NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/supabase/auth";
import { getCreditNotesByOrgSlug } from "@/modules/credit-notes/service/credit-notes.service";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orgSlug: string }> }
) {
  try {
    const auth = await requireAuthResponse();
    if (auth) {
      return auth;
    }

    const { orgSlug } = await params;
    await guardOrganizationPermissionAccess(orgSlug, "creditnotes.manage");

    const data = await getCreditNotesByOrgSlug(orgSlug);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error" },
      { status: 500 }
    );
  }
}

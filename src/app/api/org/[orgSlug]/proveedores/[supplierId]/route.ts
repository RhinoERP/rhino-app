import { revalidatePath } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/supabase/auth";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { deleteSupplierById } from "@/modules/suppliers/service/suppliers.service";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ orgSlug: string; supplierId: string }> }
) {
  const authError = await requireAuthResponse();
  if (authError) {
    return authError;
  }

  const { orgSlug, supplierId } = await context.params;

  if (!supplierId) {
    return NextResponse.json(
      { error: "Supplier ID requerido" },
      { status: 400 }
    );
  }

  try {
    const org = await getOrganizationBySlug(orgSlug);
    if (!org?.id) {
      return NextResponse.json(
        { error: "Organización no encontrada" },
        { status: 404 }
      );
    }

    await deleteSupplierById(supplierId, org.id);

    revalidatePath(`/org/${orgSlug}/proveedores`);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error eliminando proveedor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

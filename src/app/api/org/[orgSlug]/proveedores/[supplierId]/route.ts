import { type NextRequest, NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/supabase/auth";
import {
  deleteSupplierById,
  updateSupplierForOrg,
} from "@/modules/suppliers/service/suppliers.service";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ orgSlug: string; supplierId: string }> }
) {
  const authError = await requireAuthResponse();
  if (authError) {
    return authError;
  }

  const { supplierId } = await context.params;

  if (!supplierId) {
    return NextResponse.json(
      { error: "Supplier ID requerido" },
      { status: 400 }
    );
  }

  try {
    await deleteSupplierById(supplierId);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error eliminando proveedor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ orgSlug: string; supplierId: string }> }
) {
  const authError = await requireAuthResponse();

  if (authError) {
    return authError;
  }

  const { orgSlug, supplierId } = await context.params;

  if (!orgSlug) {
    return NextResponse.json(
      { error: "Slug de organización requerido" },
      { status: 400 }
    );
  }

  if (!supplierId) {
    return NextResponse.json(
      { error: "Supplier ID requerido" },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const {
      name,
      cuit,
      phone,
      email,
      address,
      contact_name,
      payment_terms,
      notes,
    } = body ?? {};

    if (!name) {
      return NextResponse.json(
        { error: "El nombre del proveedor es requerido" },
        { status: 400 }
      );
    }

    const supplier = await updateSupplierForOrg({
      supplierId,
      orgSlug,
      name,
      cuit,
      phone,
      email,
      address,
      contact_name,
      payment_terms,
      notes,
    });

    return NextResponse.json({ success: true, supplier });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error actualizando proveedor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { type NextRequest, NextResponse } from "next/server";

import { createSupplierForOrg } from "@/modules/suppliers/service/suppliers.service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      orgSlug,
      name,
      cuit,
      phone,
      email,
      address,
      contact_name,
      payment_terms,
      notes,
    } = body ?? {};

    if (!orgSlug) {
      return NextResponse.json(
        { error: "Slug de organización requerido" },
        { status: 400 }
      );
    }

    if (!name) {
      return NextResponse.json(
        { error: "El nombre del proveedor es requerido" },
        { status: 400 }
      );
    }

    const supplier = await createSupplierForOrg({
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
      error instanceof Error ? error.message : "Error creando proveedor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { type NextRequest, NextResponse } from "next/server";

import { requireAuthResponse } from "@/lib/supabase/auth";
import {
  createSupplierForOrg,
  getSuppliersByOrgSlug,
} from "@/modules/suppliers/service/suppliers.service";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ orgSlug: string }> }
) {
  const authError = await requireAuthResponse();

  if (authError) {
    return authError;
  }

  try {
    const { orgSlug } = await context.params;
    const suppliers = await getSuppliersByOrgSlug(orgSlug);
    return NextResponse.json(suppliers);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error obteniendo proveedores";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authError = await requireAuthResponse();

  if (authError) {
    return authError;
  }

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

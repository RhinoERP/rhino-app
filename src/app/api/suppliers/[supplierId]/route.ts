import { type NextRequest, NextResponse } from "next/server";

import { deleteSupplierById } from "@/modules/suppliers/service/suppliers.service";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ supplierId: string }> }
) {
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

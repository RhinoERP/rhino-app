import { type NextRequest, NextResponse } from "next/server";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";
import { processBulkSupplierPayment } from "@/modules/purchases/service/purchases.service";

export async function POST(request: NextRequest) {
  const input = await request.json();

  await guardOrganizationPermissionAccess(input.orgSlug, "collections.manage");

  try {
    if (input.paymentMethod === "cheque" || input.paymentMethod === "e-cheq") {
      return NextResponse.json(
        {
          message:
            "Los pagos masivos con cheque no están habilitados. Registra cada pago individualmente.",
        },
        { status: 400 }
      );
    }

    const result = await processBulkSupplierPayment(input);

    if (!result.success) {
      return NextResponse.json(
        { message: result.error, code: result.code },
        { status: 400 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Error al procesar el pago masivo a proveedor",
      },
      { status: 500 }
    );
  }
}

import { type NextRequest, NextResponse } from "next/server";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";
import { calculateBulkSupplierPaymentDistribution } from "@/modules/purchases/service/purchases.service";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const orgSlug = searchParams.get("orgSlug");
    const supplierId = searchParams.get("supplierId");
    const totalAmountStr = searchParams.get("totalAmount");

    if (!(orgSlug && supplierId && totalAmountStr)) {
      return NextResponse.json(
        { message: "Parámetros faltantes" },
        { status: 400 }
      );
    }

    await guardOrganizationPermissionAccess(orgSlug, "collections.manage");

    const totalAmount = Number.parseFloat(totalAmountStr);

    if (Number.isNaN(totalAmount) || totalAmount <= 0) {
      return NextResponse.json({ message: "Monto inválido" }, { status: 400 });
    }

    const distributions = await calculateBulkSupplierPaymentDistribution(
      orgSlug,
      supplierId,
      totalAmount
    );

    return NextResponse.json(distributions);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Error al calcular distribución",
      },
      { status: 500 }
    );
  }
}

import { type NextRequest, NextResponse } from "next/server";
import { getSupplierCredits } from "@/modules/purchases/service/purchases.service";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const orgSlug = searchParams.get("orgSlug");
    const supplierId = searchParams.get("supplierId");

    if (!(orgSlug && supplierId)) {
      return NextResponse.json(
        { message: "Parámetros faltantes" },
        { status: 400 }
      );
    }

    const credits = await getSupplierCredits(orgSlug, supplierId);

    return NextResponse.json({ credits });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Error al obtener créditos del proveedor",
      },
      { status: 500 }
    );
  }
}

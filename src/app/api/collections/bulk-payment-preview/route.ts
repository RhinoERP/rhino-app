import { type NextRequest, NextResponse } from "next/server";
import { calculateBulkPaymentDistribution } from "@/modules/collections/service/collections.service";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const orgSlug = searchParams.get("orgSlug");
    const customerId = searchParams.get("customerId");
    const totalAmountStr = searchParams.get("totalAmount");

    if (!(orgSlug && customerId && totalAmountStr)) {
      return NextResponse.json(
        { message: "Parámetros faltantes" },
        { status: 400 }
      );
    }

    const totalAmount = Number.parseFloat(totalAmountStr);

    if (Number.isNaN(totalAmount) || totalAmount <= 0) {
      return NextResponse.json({ message: "Monto inválido" }, { status: 400 });
    }

    const distributions = await calculateBulkPaymentDistribution(
      orgSlug,
      customerId,
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

import { type NextRequest, NextResponse } from "next/server";
import { applySupplierCreditToPurchase } from "@/modules/purchases/service/purchases.service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orgSlug, supplierId, accountPayableId, amount } = body;

    if (!(orgSlug && supplierId && accountPayableId && amount)) {
      return NextResponse.json(
        { message: "Parámetros faltantes" },
        { status: 400 }
      );
    }

    const result = await applySupplierCreditToPurchase(
      orgSlug,
      supplierId,
      accountPayableId,
      amount
    );

    if (!result.success) {
      return NextResponse.json({ message: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Error al aplicar crédito",
      },
      { status: 500 }
    );
  }
}

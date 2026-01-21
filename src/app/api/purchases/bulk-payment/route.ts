import { type NextRequest, NextResponse } from "next/server";
import { processBulkSupplierPayment } from "@/modules/purchases/service/purchases.service";

export async function POST(request: NextRequest) {
  try {
    const input = await request.json();

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

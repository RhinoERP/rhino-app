import { type NextRequest, NextResponse } from "next/server";
import { processBulkPayment } from "@/modules/collections/service/collections.service";
import type { BulkPaymentInput } from "@/modules/collections/types";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";

export async function POST(request: NextRequest) {
  try {
    const input: BulkPaymentInput = await request.json();

    await guardOrganizationPermissionAccess(
      input.orgSlug,
      "collections.manage"
    );

    const result = await processBulkPayment(input);

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
            : "Error al procesar el pago masivo",
      },
      { status: 500 }
    );
  }
}

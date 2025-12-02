import { type NextRequest, NextResponse } from "next/server";
import { createCustomerForOrg } from "@/modules/customers/service/customers.service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const customer = await createCustomerForOrg(body);
    return NextResponse.json(customer, { status: 201 });
  } catch (error) {
    console.error("Error creating customer:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Error interno del servidor",
      },
      { status: 500 }
    );
  }
}

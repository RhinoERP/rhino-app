import { type NextRequest, NextResponse } from "next/server";
import { getCustomerById } from "@/modules/customers/service/customers.service";

type RouteContext = {
  params: Promise<{ orgSlug: string; customerId: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { customerId } = await context.params;
    const customer = await getCustomerById(customerId);

    if (!customer) {
      return NextResponse.json(
        { error: "Cliente no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json(customer);
  } catch (error) {
    console.error("Error fetching customer:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Error interno del servidor",
      },
      { status: 500 }
    );
  }
}

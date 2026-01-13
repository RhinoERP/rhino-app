import { NextResponse } from "next/server";
import { getCustomerCreditBalance } from "@/modules/collections/service/collections.service";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const orgSlug = searchParams.get("orgSlug");
    const customerId = searchParams.get("customerId");

    if (!(orgSlug && customerId)) {
      return NextResponse.json(
        { error: "Parámetros requeridos: orgSlug, customerId" },
        { status: 400 }
      );
    }

    const creditBalance = await getCustomerCreditBalance(orgSlug, customerId);

    return NextResponse.json({ creditBalance });
  } catch (error) {
    console.error("Error al obtener crédito del cliente:", error);
    return NextResponse.json(
      {
        error: "Error al obtener crédito del cliente",
        message: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}

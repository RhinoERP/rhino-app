import { NextResponse } from "next/server";
import { getCustomerCreditBreakdown } from "@/modules/collections/service/collections.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const orgSlug = searchParams.get("orgSlug");
    const customerId = searchParams.get("customerId");
    const supplierId = searchParams.get("supplierId");

    if (!(orgSlug && customerId)) {
      return NextResponse.json(
        { error: "Parámetros requeridos: orgSlug, customerId" },
        { status: 400 }
      );
    }

    const org = await getOrganizationBySlug(orgSlug);
    const breakdown = await getCustomerCreditBreakdown(orgSlug, customerId);

    if (supplierId && org?.supplier_differentiated_credits) {
      const filtered = breakdown.bySupplier.filter(
        (entry) => entry.supplierId === supplierId
      );
      const filteredTotal = filtered.reduce(
        (sum, entry) => sum + entry.amount,
        0
      );

      return NextResponse.json({
        total: filteredTotal,
        enabled: true,
        bySupplier: filtered,
      });
    }

    return NextResponse.json({
      total: breakdown.total,
      enabled: org?.supplier_differentiated_credits ?? false,
      bySupplier: breakdown.bySupplier,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Error al obtener crédito del cliente",
        message: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { getPriceListsByOrgSlug } from "@/modules/price-lists/service/price-lists.service";

type RouteParams = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { orgSlug } = await params;
    const priceLists = await getPriceListsByOrgSlug(orgSlug);
    return NextResponse.json(priceLists);
  } catch (error) {
    console.error("Error fetching price lists:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error al obtener listas de precios",
      },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { getProductSalePrice } from "@/modules/sales-price-lists/service/sales-price-lists.service";

type RouteParams = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { orgSlug } = await params;
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");
    const customerId = searchParams.get("customerId");

    if (!productId) {
      return NextResponse.json(
        { error: "productId es requerido" },
        { status: 400 }
      );
    }

    const price = await getProductSalePrice(
      orgSlug,
      productId,
      customerId || null
    );

    return NextResponse.json({ price });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

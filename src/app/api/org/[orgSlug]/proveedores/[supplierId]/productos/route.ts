import { NextResponse } from "next/server";
import { getProductsBySupplier } from "@/modules/purchases/service/purchases.service";

type RouteContext = {
  params: Promise<{
    orgSlug: string;
    supplierId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { orgSlug, supplierId } = await context.params;
    const products = await getProductsBySupplier(orgSlug, supplierId);
    return NextResponse.json(products);
  } catch (error) {
    console.error("Error fetching products by supplier:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error al obtener productos del proveedor",
      },
      { status: 500 }
    );
  }
}

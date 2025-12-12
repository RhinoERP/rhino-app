import { type NextRequest, NextResponse } from "next/server";
import { createProductForOrg } from "@/modules/inventory/service/inventory.service";

type RouteContext = {
  params: Promise<{ orgSlug: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { orgSlug } = await context.params;
    const body = await request.json();

    // El orgSlug viene de la URL, no del body
    const productData = {
      ...body,
      orgSlug,
    };

    const product = await createProductForOrg(productData);
    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    console.error("Error creating product:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Error interno del servidor",
      },
      { status: 500 }
    );
  }
}

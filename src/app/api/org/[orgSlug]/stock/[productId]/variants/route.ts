import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthResponse } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getProductVariantsWithStock } from "@/modules/inventory/service/inventory.service";
import { getStockReadScope } from "@/modules/inventory/utils/stock-read-scope";
import { WarehouseAccessError } from "@/modules/inventory/utils/warehouse-access-error";
import { getOrganizationLayoutData } from "@/modules/organizations/service/organizations.service";

type RouteContext = {
  params: Promise<{ orgSlug: string; productId: string }>;
};

const variantParamsSchema = z.object({
  productId: z.uuid(),
  warehouseId: z.uuid().optional(),
});

export async function GET(request: NextRequest, context: RouteContext) {
  const authError = await requireAuthResponse();
  if (authError) {
    return authError;
  }

  try {
    const { orgSlug, productId } = await context.params;
    const warehouseId =
      request.nextUrl.searchParams.get("warehouseId") || undefined;
    if (!variantParamsSchema.safeParse({ productId, warehouseId }).success) {
      return NextResponse.json(
        { error: "Producto o depósito inválido" },
        { status: 400 }
      );
    }
    const layoutData = await getOrganizationLayoutData(orgSlug);
    const scope = getStockReadScope(layoutData?.permissions ?? []);
    if (!(layoutData && scope)) {
      return NextResponse.json(
        { error: "No tenés permisos para consultar inventario" },
        { status: 403 }
      );
    }
    const supabase = await createClient();
    let productQuery = supabase
      .from("products")
      .select("id")
      .eq("organization_id", layoutData.currentOrganization.id)
      .eq("id", productId);
    if (scope === "mercadolibre") {
      productQuery = productQuery.ilike("sku", "MELI-%");
    }
    const { data: product, error } = await productQuery.maybeSingle();
    if (error) {
      throw new Error("No se pudo verificar el producto");
    }
    if (!product) {
      return NextResponse.json(
        { error: "Producto no encontrado" },
        { status: 404 }
      );
    }
    const variants = await getProductVariantsWithStock(
      orgSlug,
      productId,
      warehouseId
    );
    return NextResponse.json(variants);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof WarehouseAccessError
            ? error.message
            : "No se pudieron cargar las variantes",
      },
      { status: error instanceof WarehouseAccessError ? error.status : 500 }
    );
  }
}

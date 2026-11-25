import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthResponse } from "@/lib/supabase/auth";
import { createClient, type SupabaseServerClient } from "@/lib/supabase/server";
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

type VariantAccess =
  | { allowed: false; error: string }
  | {
      allowed: true;
      organizationId: string;
      scope: ReturnType<typeof getStockReadScope>;
      isDistributorCatalogScope: boolean;
    };

function resolveVariantAccess(
  layoutData: Awaited<ReturnType<typeof getOrganizationLayoutData>>,
  warehouseId?: string
): VariantAccess {
  const permissions = layoutData?.permissions ?? [];
  const scope = getStockReadScope(permissions);
  const canViewDistributorCatalog = permissions.includes("distributor.catalog");
  const isDistributorCatalogScope =
    scope !== "inventory" && canViewDistributorCatalog;

  if (!(layoutData && (scope || canViewDistributorCatalog))) {
    return {
      allowed: false,
      error: "No tenés permisos para consultar inventario",
    };
  }
  if (isDistributorCatalogScope && warehouseId) {
    return {
      allowed: false,
      error: "El catálogo distribuidor solo muestra stock agregado",
    };
  }

  return {
    allowed: true,
    organizationId: layoutData.currentOrganization.id,
    scope,
    isDistributorCatalogScope,
  };
}

function findVisibleProduct(params: {
  supabase: SupabaseServerClient;
  organizationId: string;
  productId: string;
  scope: ReturnType<typeof getStockReadScope>;
  isDistributorCatalogScope: boolean;
}) {
  let query = params.supabase
    .from("products")
    .select("id")
    .eq("organization_id", params.organizationId)
    .eq("id", params.productId);

  if (params.isDistributorCatalogScope) {
    query = query.eq("is_active", true);
  } else if (params.scope === "mercadolibre") {
    query = query.ilike("sku", "MELI-%");
  }

  return query.maybeSingle();
}

function sanitizeDistributorVariants(
  variants: Awaited<ReturnType<typeof getProductVariantsWithStock>>
) {
  return variants.map(({ id, talle, color, product_lots }) => ({
    id,
    talle,
    color,
    product_lots,
  }));
}

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
    const access = resolveVariantAccess(layoutData, warehouseId);
    if (!access.allowed) {
      return NextResponse.json({ error: access.error }, { status: 403 });
    }
    const supabase = await createClient();
    const { data: product, error } = await findVisibleProduct({
      supabase,
      organizationId: access.organizationId,
      productId,
      scope: access.scope,
      isDistributorCatalogScope: access.isDistributorCatalogScope,
    });
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
    return NextResponse.json(
      access.isDistributorCatalogScope
        ? sanitizeDistributorVariants(variants)
        : variants
    );
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

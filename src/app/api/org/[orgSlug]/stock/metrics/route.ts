import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthResponse } from "@/lib/supabase/auth";
import { getStockMetrics } from "@/modules/inventory/service/inventory.service";
import { parseStockMetrics } from "@/modules/inventory/utils/stock-metrics-schema";
import { getStockReadScope } from "@/modules/inventory/utils/stock-read-scope";
import { WarehouseAccessError } from "@/modules/inventory/utils/warehouse-access-error";
import { getOrganizationLayoutData } from "@/modules/organizations/service/organizations.service";

const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ orgSlug: string }> }
) {
  const authError = await requireAuthResponse();
  if (authError) {
    authError.headers.set("Cache-Control", privateHeaders["Cache-Control"]);
    return authError;
  }
  try {
    const { orgSlug } = await context.params;
    const layoutData = await getOrganizationLayoutData(orgSlug);
    if (getStockReadScope(layoutData?.permissions ?? []) !== "inventory") {
      return NextResponse.json(
        { error: "No tenés permisos para consultar estos indicadores" },
        { status: 403, headers: privateHeaders }
      );
    }
    const warehouseId =
      request.nextUrl.searchParams.get("warehouseId") || undefined;
    if (!z.uuid().optional().safeParse(warehouseId).success) {
      return NextResponse.json(
        { error: "Depósito inválido" },
        { status: 400, headers: privateHeaders }
      );
    }
    const metrics = await getStockMetrics(orgSlug, warehouseId, request.signal);
    const canViewCosts = layoutData?.permissions.some((permission) =>
      ["organization.admin", "inventory.manage"].includes(permission)
    );
    if (!canViewCosts) {
      return NextResponse.json(
        parseStockMetrics({ ...metrics, canViewCosts: false }),
        { headers: privateHeaders }
      );
    }
    return NextResponse.json(metrics, {
      headers: privateHeaders,
    });
  } catch (error) {
    if (!(error instanceof WarehouseAccessError || request.signal.aborted)) {
      console.error("Error fetching stock metrics:", error);
    }
    return NextResponse.json(
      {
        error:
          error instanceof WarehouseAccessError
            ? error.message
            : "No se pudieron cargar los indicadores de stock",
      },
      {
        status: error instanceof WarehouseAccessError ? error.status : 500,
        headers: privateHeaders,
      }
    );
  }
}

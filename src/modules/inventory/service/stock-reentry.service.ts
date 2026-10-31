import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin-client";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";
import {
  STOCK_REENTRY_FALLBACK_CODE,
  type StockReentryEntry,
  StockReentryFallbackRequiredError,
} from "../utils/stock-reentry";
import { getAvailableWarehouses } from "./warehouse-stock.service";

export async function checkReentryWarehouse(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  warehouseId: string;
  allowDefaultFallback?: boolean;
}): Promise<void> {
  const { data: warehouse, error } = await params.supabase
    .from("warehouses")
    .select("is_active")
    .eq("organization_id", params.orgId)
    .eq("id", params.warehouseId)
    .single();
  if (error || !warehouse) {
    throw new Error("No se pudo identificar el depósito original");
  }
  if (!(warehouse.is_active || params.allowDefaultFallback)) {
    throw new StockReentryFallbackRequiredError();
  }
  const { data: org, error: orgError } = await params.supabase
    .from("organizations")
    .select("slug")
    .eq("id", params.orgId)
    .single();
  if (orgError || !org?.slug) {
    throw new Error("Organización no encontrada");
  }
  const allowed = await getAvailableWarehouses(org.slug);
  const destination = warehouse.is_active
    ? allowed.find((row) => row.id === params.warehouseId)
    : allowed.find((row) => row.is_default);
  if (!destination) {
    throw new Error("No tenés acceso a un depósito válido para este reingreso");
  }
}

export async function checkReentryOrigins(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  lotIds: string[];
  allowDefaultFallback?: boolean;
}): Promise<void> {
  const ids = [...new Set(params.lotIds)];
  if (!ids.length) {
    return;
  }
  const { data: lots, error } = await params.supabase
    .from("product_lots")
    .select("id, warehouse_id")
    .eq("organization_id", params.orgId)
    .in("id", ids);
  if (error || lots?.length !== ids.length) {
    throw new Error("No se encontró un lote original para el reingreso");
  }
  for (const warehouseId of new Set(lots.map((lot) => lot.warehouse_id))) {
    await checkReentryWarehouse({ ...params, warehouseId });
  }
}

async function getActorId(supabase: SupabaseServerClient): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error("Usuario no autenticado");
  }
  return data.user.id;
}

async function resolveReentryOperationKey(
  supabase: SupabaseServerClient,
  orgId: string,
  baseKey: string
): Promise<string> {
  if (baseKey.length > 163) {
    throw new Error("La identidad del reingreso supera el largo permitido");
  }
  let key = baseKey;
  for (;;) {
    const { data, error } = await supabase
      .from("stock_movements")
      .select("id, reentry_reversed_at")
      .eq("organization_id", orgId)
      .eq("reentry_key", key)
      .maybeSingle();
    if (error) {
      throw new Error("No se pudo verificar la identidad del reingreso");
    }
    if (!data?.reentry_reversed_at) {
      return key;
    }
    // A failed saga can retry after compensation, but concurrent retries use
    // the same next-generation key rather than two fresh random operations.
    key = `${baseKey}:${data.id}`;
  }
}

export async function applyStockReentries(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  entries: StockReentryEntry[];
  allowDefaultFallback?: boolean;
}): Promise<string[]> {
  if (!params.entries.length) {
    return [];
  }
  await checkReentryOrigins({
    ...params,
    lotIds: params.entries.map((entry) => entry.sourceLotId),
  });
  const actorId = await getActorId(params.supabase);
  const resolvedKeys = await Promise.all(
    params.entries.map((entry) =>
      resolveReentryOperationKey(
        params.supabase,
        params.orgId,
        entry.operationKey
      )
    )
  );
  const args: Database["public"]["Functions"]["apply_stock_reentries"]["Args"] =
    {
      p_org_id: params.orgId,
      p_actor_id: actorId,
      p_allow_default_fallback: params.allowDefaultFallback ?? false,
      p_entries: params.entries.map((entry, index) => ({
        source_lot_id: entry.sourceLotId,
        quantity: entry.quantity,
        unit_quantity: entry.unitQuantity ?? null,
        reason: entry.reason,
        operation_key: resolvedKeys[index],
      })),
    };
  const { data, error } = await createAdminClient().rpc(
    "apply_stock_reentries",
    args
  );
  if (error) {
    if (error.details === STOCK_REENTRY_FALLBACK_CODE) {
      throw new StockReentryFallbackRequiredError();
    }
    throw new Error(error.message);
  }
  return z.array(z.string()).parse(data);
}

export async function undoStockReentries(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  movementIds: string[];
}): Promise<void> {
  if (!params.movementIds.length) {
    return;
  }
  const actorId = await getActorId(params.supabase);
  const args: Database["public"]["Functions"]["undo_stock_reentries"]["Args"] =
    {
      p_org_id: params.orgId,
      p_actor_id: actorId,
      p_movement_ids: params.movementIds,
    };
  const { error } = await createAdminClient().rpc("undo_stock_reentries", args);
  if (error) {
    throw new Error(`No se pudo compensar el reingreso: ${error.message}`);
  }
}

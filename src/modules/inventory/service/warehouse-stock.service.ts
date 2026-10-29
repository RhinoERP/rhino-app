import { z } from "zod";
import { requireAuth } from "@/lib/supabase/auth";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { Database } from "@/types/supabase";

export type Warehouse = Database["public"]["Tables"]["warehouses"]["Row"];
export type WarehouseStockLot =
  Database["public"]["Tables"]["product_lots"]["Row"];
export type WarehouseChannel = "wholesale" | "direct_sale";

async function resolveWarehouseContext(orgSlug: string) {
  const auth = await requireAuth();
  if (!auth) {
    throw new Error("No autorizado");
  }
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }
  const { supabase, userId } = auth;
  const { data: member, error } = await supabase
    .from("organization_members")
    .select("is_owner")
    .eq("organization_id", org.id)
    .eq("user_id", userId)
    .eq("is_active", true)
    .single();
  if (error || !member) {
    throw new Error("No tenés acceso a la organización");
  }
  const { data: permissions, error: permissionError } = await supabase.rpc(
    "get_user_org_permissions_by_slug",
    { target_org_slug: orgSlug }
  );
  if (permissionError) {
    throw new Error("No se pudieron verificar los permisos de depósitos");
  }
  const isAdmin =
    member.is_owner || permissions?.includes("organization.admin") === true;
  return { supabase, orgId: org.id, userId, isAdmin, permissions };
}

/** Operational choices only: active, channel-compatible and assigned. */
export async function getAvailableWarehouses(
  orgSlug: string,
  channel: WarehouseChannel
): Promise<Warehouse[]> {
  const context = await resolveWarehouseContext(orgSlug);
  const { supabase, orgId, userId, isAdmin } = context;
  let query = supabase
    .from("warehouses")
    .select("*")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .eq(
      channel === "wholesale" ? "wholesale_enabled" : "direct_sale_enabled",
      true
    )
    .order("is_default", { ascending: false })
    .order("name");
  if (!isAdmin) {
    const { data: assignments, error: assignmentError } = await supabase
      .from("warehouse_user_assignments")
      .select("warehouse_id")
      .eq("organization_id", orgId)
      .eq("user_id", userId);
    if (assignmentError) {
      throw new Error(
        `No se pudieron consultar las asignaciones: ${assignmentError.message}`
      );
    }
    if (!assignments.length) {
      return [];
    }
    query = query.in(
      "id",
      assignments.map((row) => row.warehouse_id)
    );
  }
  const { data, error } = await query;
  if (error) {
    throw new Error(`No se pudieron consultar los depósitos: ${error.message}`);
  }
  return data;
}

/** Stock validation callers must pass the same warehouse used for deduction. */
export async function getWarehouseProductLots(params: {
  orgSlug: string;
  warehouseId: string;
  channel: WarehouseChannel;
  productIds: string[];
}): Promise<WarehouseStockLot[]> {
  const warehouses = await getAvailableWarehouses(
    params.orgSlug,
    params.channel
  );
  if (!warehouses.some((warehouse) => warehouse.id === params.warehouseId)) {
    throw new Error("No tenés acceso al depósito seleccionado para este canal");
  }
  const { supabase, orgId } = await resolveWarehouseContext(params.orgSlug);
  if (!params.productIds.length) {
    return [];
  }
  const { data, error } = await supabase
    .from("product_lots")
    .select("*")
    .eq("organization_id", orgId)
    .eq("warehouse_id", params.warehouseId)
    .in("product_id", [...new Set(params.productIds)])
    .order("expiration_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .order("id");
  if (error) {
    throw new Error(
      `No se pudo consultar el stock del depósito: ${error.message}`
    );
  }
  return data;
}

/** Includes inactive warehouses in history; operational selectors exclude them. */
export async function getWarehouseTransfers(
  orgSlug: string,
  warehouseId: string
) {
  z.uuid().parse(warehouseId);
  const { supabase, orgId, isAdmin, permissions, userId } =
    await resolveWarehouseContext(orgSlug);
  if (!(isAdmin || permissions?.includes("inventory.read"))) {
    throw new Error("No tenés permiso para consultar el historial de stock");
  }
  if (!isAdmin) {
    const { data: assignment, error: assignmentError } = await supabase
      .from("warehouse_user_assignments")
      .select("warehouse_id")
      .eq("organization_id", orgId)
      .eq("warehouse_id", warehouseId)
      .eq("user_id", userId)
      .maybeSingle();
    if (assignmentError || !assignment) {
      throw new Error("No tenés acceso al depósito seleccionado");
    }
  }
  const { data, error } = await supabase
    .from("stock_transfers")
    .select("*, items:stock_transfer_items(*)")
    .eq("organization_id", orgId)
    .or(
      `source_warehouse_id.eq.${warehouseId},destination_warehouse_id.eq.${warehouseId}`
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    throw new Error(
      `No se pudieron consultar las transferencias: ${error.message}`
    );
  }
  return data;
}

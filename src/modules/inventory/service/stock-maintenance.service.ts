import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { getAvailableWarehouses } from "./warehouse-stock.service";

export async function resolveInventoryWarehouseId(
  orgSlug: string,
  requestedId?: string
): Promise<string> {
  if (requestedId) {
    z.uuid().parse(requestedId);
  }
  const warehouses = await getAvailableWarehouses(orgSlug);
  const selectedId =
    requestedId ?? (warehouses.length === 1 ? warehouses[0].id : undefined);
  const warehouse = warehouses.find((row) => row.id === selectedId);
  if (!warehouse) {
    throw new Error("Seleccioná un depósito activo habilitado para tu usuario");
  }
  return warehouse.id;
}

export async function setWarehouseStockBalance(input: {
  orgSlug: string;
  warehouseId: string;
  productId: string;
  productVariantId?: string | null;
  lotId?: string;
  lotNumber: string;
  expirationDate: string | null;
  quantity: number;
  unitQuantity?: number | null;
  reason: string;
  source: "MANUAL" | "IMPORT";
}): Promise<string> {
  const org = await getOrganizationBySlug(input.orgSlug);
  if (!org) {
    throw new Error("Organización no encontrada");
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_warehouse_stock_balance", {
    p_org_id: org.id,
    p_warehouse_id: input.warehouseId,
    p_product_id: input.productId,
    p_product_variant_id: input.productVariantId ?? undefined,
    p_lot_id: input.lotId,
    p_lot_number: input.lotNumber,
    p_expiration_date: input.expirationDate ?? undefined,
    p_quantity: input.quantity,
    p_unit_quantity: input.unitQuantity ?? undefined,
    p_reason: input.reason,
    p_source: input.source,
  });
  if (error || !data) {
    throw new Error(error?.message ?? "No se pudo ajustar el saldo del lote");
  }
  return data;
}

export async function setVariantWarehouseStock(input: {
  orgSlug: string;
  warehouseId: string;
  variantId: string;
  quantity: number;
}): Promise<string> {
  const org = await getOrganizationBySlug(input.orgSlug);
  if (!org) {
    throw new Error("Organización no encontrada");
  }
  const supabase = await createClient();
  const { data: variant, error: variantError } = await supabase
    .from("product_variants")
    .select("product_id")
    .eq("organization_id", org.id)
    .eq("id", input.variantId)
    .single();
  if (variantError || !variant) {
    throw new Error("Variante no encontrada en esta organización");
  }
  const { data: lots, error: lotError } = await supabase
    .from("product_lots")
    .select("id, lot_number, expiration_date")
    .eq("organization_id", org.id)
    .eq("warehouse_id", input.warehouseId)
    .eq("product_variant_id", input.variantId)
    .limit(2);
  if (lotError || !lots) {
    throw new Error("No se pudo consultar el saldo de la variante");
  }
  if (lots.length > 1) {
    throw new Error(
      "La variante tiene varios lotes en este depósito; ajustá cada lote desde Movimientos"
    );
  }
  await setWarehouseStockBalance({
    orgSlug: input.orgSlug,
    warehouseId: input.warehouseId,
    productId: variant.product_id,
    productVariantId: input.variantId,
    lotId: lots[0]?.id,
    lotNumber: lots[0]?.lot_number ?? "DEFAULT",
    expirationDate: lots[0]?.expiration_date ?? null,
    quantity: input.quantity,
    reason: "Ajuste manual de stock por variante",
    source: "MANUAL",
  });
  return variant.product_id;
}

export async function applyWarehouseStockMovement(input: {
  orgSlug: string;
  warehouseId?: string;
  productId: string;
  lotId: string;
  type: "INBOUND" | "OUTBOUND" | "ADJUSTMENT";
  quantity: number;
  unitQuantity?: number | null;
  reason?: string | null;
  source?: "MANUAL" | "IMPORT";
}) {
  const org = await getOrganizationBySlug(input.orgSlug);
  if (!org) {
    throw new Error("Organización no encontrada");
  }
  const supabase = await createClient();
  const { data: lot, error: lotError } = await supabase
    .from("product_lots")
    .select("warehouse_id")
    .eq("organization_id", org.id)
    .eq("product_id", input.productId)
    .eq("id", input.lotId)
    .single();
  if (lotError || !lot) {
    throw new Error("Lote no encontrado para el producto y organización");
  }
  if (input.warehouseId && input.warehouseId !== lot.warehouse_id) {
    throw new Error("El lote no pertenece al depósito seleccionado");
  }
  const { data, error } = await supabase.rpc("apply_warehouse_stock_movement", {
    p_org_id: org.id,
    p_warehouse_id: lot.warehouse_id,
    p_product_id: input.productId,
    p_lot_id: input.lotId,
    p_type: input.type,
    p_quantity: input.quantity,
    p_unit_quantity: input.unitQuantity ?? undefined,
    p_reason: input.reason ?? undefined,
    p_source: input.source ?? "MANUAL",
  });
  if (error || !data) {
    throw new Error(error?.message ?? "No se pudo registrar el movimiento");
  }
  return { id: data };
}

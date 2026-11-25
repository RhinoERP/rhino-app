"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth } from "@/lib/supabase/auth";
import {
  getAvailableWarehouses,
  getWarehouseProductLots,
  resolveWholesaleWarehouseId,
} from "@/modules/inventory/service/warehouse-stock.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";

export async function getQuoteWarehousesAction(orgSlug: string) {
  await ensure("quotes.manage", orgSlug);
  const warehouses = await getAvailableWarehouses(orgSlug, "wholesale");
  return warehouses.map(({ id, name }) => ({ id, name }));
}

export async function getQuoteWarehouseAvailabilityAction(input: {
  orgSlug: string;
  warehouseId: string;
  productIds: string[];
}) {
  await ensure("quotes.manage", input.orgSlug);
  z.object({
    warehouseId: z.uuid(),
    productIds: z.array(z.uuid()).max(50),
  }).parse(input);
  const lots = await getWarehouseProductLots({
    ...input,
    channel: "wholesale",
  });
  return input.productIds.map((productId) => ({
    productId,
    totalStock: lots
      .filter((lot) => lot.product_id === productId)
      .reduce((sum, lot) => sum + lot.quantity_available, 0),
  }));
}

export async function getQuoteWarehouseVariantsAction(input: {
  orgSlug: string;
  warehouseId: string;
  productId: string;
}) {
  await ensure("quotes.manage", input.orgSlug);
  z.object({ warehouseId: z.uuid(), productId: z.uuid() }).parse(input);
  const lots = await getWarehouseProductLots({
    ...input,
    productIds: [input.productId],
    channel: "wholesale",
  });
  const auth = await requireAuth();
  const org = await getOrganizationBySlug(input.orgSlug);
  if (!(auth && org)) {
    throw new Error("Organización no disponible");
  }
  const { data, error } = await auth.supabase
    .from("product_variants")
    .select("id, talle, color")
    .eq("organization_id", org.id)
    .eq("product_id", input.productId)
    .eq("is_active", true);
  if (error) {
    throw new Error(`No se pudieron cargar las variantes: ${error.message}`);
  }
  return data.map((variant) => ({
    ...variant,
    stock: lots
      .filter((lot) => lot.product_variant_id === variant.id)
      .reduce((sum, lot) => sum + lot.quantity_available, 0),
  }));
}

export async function updateQuoteWarehouseAction(input: {
  orgSlug: string;
  quoteId: string;
  warehouseId: string;
}) {
  await ensure("quotes.manage", input.orgSlug);
  try {
    z.object({ quoteId: z.uuid(), warehouseId: z.uuid() }).parse(input);
    const auth = await requireAuth();
    if (!auth) {
      throw new Error("No autorizado");
    }
    const org = await getOrganizationBySlug(input.orgSlug);
    if (!org) {
      throw new Error("Organización no encontrada");
    }
    const warehouseId = await resolveWholesaleWarehouseId(
      input.orgSlug,
      input.warehouseId
    );
    const { data, error } = await auth.supabase
      .from("quotes")
      .update({ warehouse_id: warehouseId })
      .eq("organization_id", org.id)
      .eq("id", input.quoteId)
      .neq("status", "CONVERTED")
      .select("id")
      .single();
    if (error || !data) {
      throw new Error(
        error?.message ??
          "El presupuesto ya fue convertido o no está disponible"
      );
    }
    revalidatePath(
      `/org/${input.orgSlug}/presupuestos/${input.quoteId}/editar`
    );
    revalidatePath(`/org/${input.orgSlug}/listas-de-presupuestos`);
    return { success: true as const };
  } catch (error) {
    return {
      success: false as const,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo cambiar el depósito",
    };
  }
}

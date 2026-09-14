import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { Database } from "@/types/supabase";

export type SupplierCommissionRateRow =
  Database["public"]["Tables"]["seller_supplier_commissions"]["Row"];

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Verifica que la organización tenga habilitadas las comisiones por proveedor.
 * Requiere supplier_differentiated_credits (gating de la feature) + commissions_enabled.
 */
async function assertSupplierCommissionFeatureEnabled(
  orgSlug: string
): Promise<{ id: string }> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  if (org.supplier_differentiated_credits !== true) {
    throw new Error(
      "Las comisiones por proveedor requieren créditos diferenciados por proveedor"
    );
  }

  if (org.commissions_enabled !== true) {
    throw new Error("El módulo de comisiones no está habilitado");
  }

  return { id: org.id };
}

/**
 * Devuelve todas las tasas de comisión vendedor × proveedor de la organización.
 */
export async function getSupplierCommissionRatesByOrg(
  orgSlug: string
): Promise<SupplierCommissionRateRow[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    return [];
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("seller_supplier_commissions")
    .select("id, seller_id, supplier_id, rate, is_active")
    .eq("organization_id", org.id)
    .eq("is_active", true);

  if (error) {
    throw new Error(
      `Error obteniendo comisiones por proveedor: ${error.message}`
    );
  }

  return (data ?? []) as SupplierCommissionRateRow[];
}

/**
 * Crea o actualiza la tasa de comisión de un vendedor para un proveedor.
 */
export async function upsertSupplierCommissionRate(
  orgSlug: string,
  sellerId: string,
  supplierId: string,
  rate: number
): Promise<void> {
  const org = await assertSupplierCommissionFeatureEnabled(orgSlug);

  if (!(sellerId && supplierId)) {
    throw new Error("Vendedor y proveedor son requeridos");
  }

  if (typeof rate !== "number" || rate < 0 || rate > 100) {
    throw new Error("La tasa debe ser un porcentaje entre 0 y 100");
  }

  const supabase = await createClient();

  const { error } = await supabase.from("seller_supplier_commissions").upsert(
    {
      organization_id: org.id,
      seller_id: sellerId,
      supplier_id: supplierId,
      rate,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,seller_id,supplier_id" }
  );

  if (error) {
    throw new Error(`Error guardando comisión por proveedor: ${error.message}`);
  }
}

/**
 * Elimina (soft) la tasa de comisión de un vendedor para un proveedor.
 */
export async function deleteSupplierCommissionRate(
  orgSlug: string,
  rateId: string
): Promise<void> {
  await assertSupplierCommissionFeatureEnabled(orgSlug);

  const supabase = await createClient();

  const { error } = await supabase
    .from("seller_supplier_commissions")
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", rateId);

  if (error) {
    throw new Error(
      `Error eliminando comisión por proveedor: ${error.message}`
    );
  }
}

/**
 * Devuelve un mapa seller × supplier → rate para lookup O(1) en la generación de comisiones.
 * Solo tasas activas.
 */
export async function getSupplierCommissionRateMap(
  supabase: SupabaseClient,
  orgId: string,
  pairs: Array<{ seller_id: string; supplier_id: string }>
): Promise<Map<string, number>> {
  const map = new Map<string, number>();

  if (pairs.length === 0) {
    return map;
  }

  const uniquePairs = [
    ...new Map(
      pairs.map((p) => [`${p.seller_id}|${p.supplier_id}`, p])
    ).values(),
  ];

  const { data, error } = await supabase
    .from("seller_supplier_commissions")
    .select("seller_id, supplier_id, rate")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .in("supplier_id", [...new Set(uniquePairs.map((p) => p.supplier_id))]);

  if (error) {
    throw new Error(
      `Error obteniendo comisiones por proveedor: ${error.message}`
    );
  }

  for (const row of data ?? []) {
    map.set(`${row.seller_id}|${row.supplier_id}`, row.rate ?? 0);
  }

  return map;
}

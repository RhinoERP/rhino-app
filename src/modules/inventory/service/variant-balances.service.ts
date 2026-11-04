import type { SupabaseServerClient } from "@/lib/supabase/server";

/** Catalog variants are independent of their warehouse balances. */
export async function createVariantsWithInitialBalances(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  productId: string;
  warehouseId: string;
  combinations: { talle: string; color: string }[];
}): Promise<void> {
  if (params.combinations.length === 0) {
    return;
  }

  const { data: variants, error } = await params.supabase
    .from("product_variants")
    .insert(
      params.combinations.map((combination) => ({
        organization_id: params.orgId,
        product_id: params.productId,
        talle: combination.talle,
        color: combination.color,
      }))
    )
    .select("id");
  if (error || variants?.length !== params.combinations.length) {
    throw new Error(
      `Error al crear variantes: ${error?.message ?? "faltan variantes creadas"}`
    );
  }

  const { error: lotsError } = await params.supabase
    .from("product_lots")
    .insert(
      variants.map((variant) => ({
        organization_id: params.orgId,
        warehouse_id: params.warehouseId,
        product_id: params.productId,
        product_variant_id: variant.id,
        lot_number: "DEFAULT",
        expiration_date: null,
        quantity_available: 0,
        unit_quantity_available: 0,
      }))
    );
  if (lotsError) {
    throw new Error(`Error al crear saldos de variantes: ${lotsError.message}`);
  }
}

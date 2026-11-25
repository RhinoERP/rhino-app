import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export async function getDefaultWarehouseId(
  supabase: SupabaseServerClient,
  organizationId: string
): Promise<string> {
  const { data, error } = await supabase
    .from("warehouses")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_default", true)
    .single();

  if (error || !data) {
    throw new Error(
      `No se pudo obtener el depósito principal: ${error?.message ?? "no existe"}`
    );
  }

  return data.id;
}

import { createAdminClient } from "@/lib/supabase/admin-client";

export type OrgActivityMetrics = {
  ventas_7d: number;
  ventas_30d: number;
  compras_7d: number;
  compras_30d: number;
  mov_stock_7d: number;
  mov_stock_30d: number;
  clientes_nuevos_30d: number;
  productos_nuevos_30d: number;
  cobros_30d: number;
  notas_credito_30d: number;
  gastos_30d: number;
  pos_7d: number;
  pos_30d: number;
};

export async function getOrgActivityMetrics(
  orgSlug: string
): Promise<OrgActivityMetrics> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("get_org_activity_metrics", {
    p_org_slug: orgSlug,
  });
  if (error) {
    throw new Error(error.message);
  }
  return data as OrgActivityMetrics;
}

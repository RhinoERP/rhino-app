import type { SupabaseServerClient } from "@/lib/supabase/server";
import { assertWholesaleWarehouseForOrganization } from "@/modules/inventory/service/warehouse-stock.service";

/** Quote ownership and location are resolved on the server, never from UI stock totals. */
export async function getQuoteItemsWarehouseId(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  quoteItemIds: string[];
}): Promise<string> {
  const ids = [...new Set(params.quoteItemIds)];
  const { data: items, error } = await params.supabase
    .from("quote_items")
    .select("id, quote_id")
    .in("id", ids);
  if (error || items?.length !== ids.length || !ids.length) {
    throw new Error("No se pudieron identificar los ítems del pedido");
  }
  const quoteIds = [...new Set(items.map((item) => item.quote_id))];
  const { data: quotes, error: quoteError } = await params.supabase
    .from("quotes")
    .select("warehouse_id")
    .eq("organization_id", params.orgId)
    .in("id", quoteIds);
  if (quoteError || quotes?.length !== quoteIds.length) {
    throw new Error("Los ítems no pertenecen a esta organización");
  }
  const warehouses = new Set(quotes.map((quote) => quote.warehouse_id));
  const warehouseId = quotes[0]?.warehouse_id;
  if (warehouses.size !== 1 || !warehouseId) {
    throw new Error("Los ítems deben pertenecer al mismo depósito");
  }
  await assertWholesaleWarehouseForOrganization(
    params.supabase,
    params.orgId,
    warehouseId
  );
  return warehouseId;
}

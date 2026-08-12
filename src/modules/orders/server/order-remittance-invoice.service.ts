import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type OrderSaleReference = {
  sales_order_id: string | null;
  parent_order_id: string | null;
};

export async function resolveOrderAuthorizedInvoiceNumber(
  supabase: SupabaseServerClient,
  order: OrderSaleReference
): Promise<string | undefined> {
  let saleId = order.sales_order_id;

  if (!saleId && order.parent_order_id) {
    const { data: parentOrder } = await supabase
      .from("orders")
      .select("sales_order_id")
      .eq("id", order.parent_order_id)
      .maybeSingle();

    saleId = parentOrder?.sales_order_id ?? null;
  }

  if (!saleId) {
    return;
  }

  const { data: sale } = await supabase
    .from("sales_orders")
    .select("arca_status, invoice_number")
    .eq("id", saleId)
    .maybeSingle();

  return sale?.arca_status === "authorized"
    ? (sale.invoice_number ?? undefined)
    : undefined;
}

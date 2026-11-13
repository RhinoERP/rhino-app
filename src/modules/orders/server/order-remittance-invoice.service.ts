import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type OrderSaleReference = {
  sales_order_id: string | null;
  parent_order_id: string | null;
};

export async function resolveOrderSaleReference(
  supabase: SupabaseServerClient,
  organizationId: string,
  order: OrderSaleReference
): Promise<string | null> {
  if (order.sales_order_id) {
    return order.sales_order_id;
  }
  if (!order.parent_order_id) {
    return null;
  }
  const parent = await supabase
    .from("orders")
    .select("sales_order_id")
    .eq("organization_id", organizationId)
    .eq("id", order.parent_order_id)
    .single();
  if (parent.error) {
    throw new Error(
      "No se pudo identificar la venta del pedido en esta organización."
    );
  }
  return parent.data.sales_order_id;
}

export async function resolveOrderAuthorizedInvoiceNumber(
  supabase: SupabaseServerClient,
  organizationId: string,
  order: OrderSaleReference
): Promise<string | undefined> {
  const saleId = await resolveOrderSaleReference(
    supabase,
    organizationId,
    order
  );

  if (!saleId) {
    return;
  }

  const { data: sale, error } = await supabase
    .from("sales_orders")
    .select("arca_status, invoice_number")
    .eq("organization_id", organizationId)
    .eq("id", saleId)
    .maybeSingle();
  if (error || !sale) {
    throw new Error(
      "No se pudo consultar la factura de la venta en esta organización."
    );
  }

  return sale?.arca_status === "authorized"
    ? (sale.invoice_number ?? undefined)
    : undefined;
}

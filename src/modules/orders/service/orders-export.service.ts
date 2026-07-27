import { createClient } from "@/lib/supabase/server";
import type {
  OrderFlowStatus,
  OrderPaginatedItem,
} from "@/modules/orders/types";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

type RawOrderRow = {
  id: string;
  order_number: string;
  status: string;
  created_at: string | null;
  updated_at: string | null;
  purchase_order_file: string | null;
  quote_id: string | null;
  sales_order_id: string | null;
  parent_order_id: string | null;
  quotes: {
    total_amount: number | null;
    currency: string | null;
    payment_condition: string | null;
    customers: {
      business_name: string | null;
      fantasy_name: string | null;
    } | null;
  } | null;
};

function mapOrderRows(
  rows: RawOrderRow[],
  childrenByParent: Map<string, OrderPaginatedItem["children"]>,
  itemsCountMap: Map<string, number>
): OrderPaginatedItem[] {
  return rows.map((row) => ({
    id: row.id,
    order_number: row.order_number,
    status: row.status as OrderFlowStatus,
    created_at: row.created_at,
    updated_at: row.updated_at,
    purchase_order_file: row.purchase_order_file,
    quote_id: row.quote_id,
    sales_order_id: row.sales_order_id,
    parent_order_id: row.parent_order_id,
    customer_name:
      row.quotes?.customers?.fantasy_name ??
      row.quotes?.customers?.business_name ??
      "—",
    currency: row.quotes?.currency ?? "ARS",
    total_amount: row.quotes?.total_amount ?? 0,
    payment_condition: row.quotes?.payment_condition ?? null,
    items_count: row.quote_id ? (itemsCountMap.get(row.quote_id) ?? 0) : 0,
    children: row.id ? (childrenByParent.get(row.id) ?? []) : [],
  }));
}

export async function getAllOrdersForExport(
  orgSlug: string
): Promise<OrderPaginatedItem[]> {
  const supabase = await createClient();
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    return [];
  }

  // TODO: add orders.read permission check

  const ordersQuery = supabase
    .from("orders")
    .select(
      `
      id,
      order_number,
      status,
      created_at,
      updated_at,
      purchase_order_file,
      quote_id,
      sales_order_id,
      parent_order_id,
      quotes!inner(
        total_amount,
        currency,
        payment_condition,
        customers(
          business_name,
          fantasy_name
        )
      )
    `
    )
    .eq("organization_id", org.id)
    .is("parent_order_id", null)
    .order("created_at", { ascending: false })
    .limit(10_000);

  const { data, error } = await ordersQuery;

  if (error || !data) {
    return [];
  }

  const parentIds = data.map((o: { id: string }) => o.id);
  const quoteIds = data
    .map((o: { quote_id: string | null }) => o.quote_id)
    .filter((id): id is string => id !== null);

  const [childrenRows, itemsCountRows] = await Promise.all([
    supabase
      .from("orders")
      .select("id, order_number, status, created_at, parent_order_id")
      .in("parent_order_id", parentIds)
      .eq("organization_id", org.id),
    supabase.from("quote_items").select("quote_id").in("quote_id", quoteIds),
  ]);

  const childrenByParent = new Map<string, OrderPaginatedItem["children"]>();
  for (const child of childrenRows.data ?? []) {
    if (child.parent_order_id) {
      const list = childrenByParent.get(child.parent_order_id) ?? [];
      list.push({
        id: child.id,
        order_number: child.order_number,
        status: child.status as OrderFlowStatus,
        created_at: child.created_at,
      });
      childrenByParent.set(child.parent_order_id, list);
    }
  }

  const itemsCountMap = new Map<string, number>();
  for (const qi of itemsCountRows.data ?? []) {
    if (qi.quote_id) {
      itemsCountMap.set(qi.quote_id, (itemsCountMap.get(qi.quote_id) ?? 0) + 1);
    }
  }

  return mapOrderRows(data as RawOrderRow[], childrenByParent, itemsCountMap);
}

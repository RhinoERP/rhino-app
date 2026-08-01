import type { SupabaseClient } from "@supabase/supabase-js";
import { truncateMoney } from "@/lib/decimal";
import { generateId } from "@/lib/id";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { createDraftPurchaseFromChildOrder } from "@/modules/purchases/service/purchases.service";
import { convertQuoteToSalesOrder } from "@/modules/quotes/service/quotes.service";
import {
  confirmIncompleteSaleWithStockDeduction,
  dispatchSaleFromOrders,
} from "@/modules/sales/service/sales.service";
import type { SalesOrderStatus } from "@/modules/sales/types";
import type { Database } from "@/types/supabase";
import { setPriority } from "../hooks/set-priority";
import { updateParentOrderStatus } from "../hooks/update-parent-order-status";
import {
  type ChildOrderForDispatch,
  type ChildOrderRoute,
  type ChildOrderSummary,
  type DispatchMetrics,
  ORDER_STATUS_CONFIG,
  type OrderAreaCounts,
  type OrderDesignProduct,
  type OrderFlowStatus,
  type OrderMetrics,
  type OrderPaginatedItem,
  type OrderStatusHistoryRowWithUser,
  type OrdersPaginatedParams,
  type OrderWithChildren,
  type OrderWithDetails,
  type OrderWithHistory,
  type PaginatedResult,
  type PurchasingOrder,
  type StockInfo,
} from "../types";

export async function getOrderIdByPurchaseOrderId(
  orgSlug: string,
  purchaseOrderId: string
): Promise<{ id: string; order_number: string } | null> {
  const supabase = await createClient();
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    return null;
  }

  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number")
    .eq("purchase_order_id", purchaseOrderId)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
}

export async function getOrderIdBySaleId(
  orgSlug: string,
  saleId: string
): Promise<{ id: string; order_number: string } | null> {
  const supabase = await createClient();
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    return null;
  }

  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number")
    .eq("sales_order_id", saleId)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
}

export async function getOrdersByOrg(
  orgSlug: string
): Promise<OrderWithDetails[]> {
  const supabase = await createClient();
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    return [];
  }

  const { data, error } = await supabase
    .from("orders")
    .select(
      `
      *,
      quotes!inner(
        id,
        total_amount,
        currency,
        payment_condition,
        observations,
        customers(
          business_name,
          fantasy_name
        ),
        quote_items(
          id,
          description,
          quantity,
          unit_price,
          subtotal,
          product_id,
          product_variant_id,
          assigned_order_id
        )
      ),
      order_designs(*)
    `
    )
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Error al obtener los pedidos: ${error.message}`);
  }

  return (data ?? []) as unknown as OrderWithDetails[];
}

export async function getParentOrdersPendingStock(
  orgSlug: string
): Promise<OrderWithChildren[]> {
  const supabase = await createClient();
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    return [];
  }

  const { data, error } = await supabase
    .from("orders")
    .select(
      `
      *,
      quotes!inner(
        id,
        total_amount,
        currency,
        payment_condition,
        observations,
        customers(
          business_name,
          fantasy_name
        ),
        quote_items(
          id,
          description,
          quantity,
          unit_price,
          subtotal,
          product_id,
          product_variant_id,
          assigned_order_id,
          product_variants!left(
            talle,
            color
          )
        )
      ),
      children:orders!parent_order_id(
        id,
        order_number,
        status,
        created_at,
        created_by,
        parent_order_id,
        observations
      )
    `
    )
    .eq("organization_id", org.id)
    .in("status", ["PENDING_STOCK", "GOODS_RECEIVED"])
    .is("parent_order_id", null)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Error al obtener pedidos padre: ${error.message}`);
  }

  return (data ?? []) as unknown as OrderWithChildren[];
}

export async function getPurchasingOrders(
  orgSlug: string
): Promise<PurchasingOrder[]> {
  const supabase = await createClient();
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    return [];
  }

  const { data, error } = await supabase
    .from("orders")
    .select(`
      id,
      order_number,
      status,
      purchase_order_id,
      parent_order_id,
      parent:orders!parent_order_id(
        order_number,
        quotes(
          customers(business_name, fantasy_name)
        )
      ),
      own_quote:quotes!quote_id(
        customers(business_name, fantasy_name)
      ),
      assigned_items:quote_items!assigned_order_id(
        id,
        description,
        quantity,
        product_id,
        product_variant_id
      )
    `)
    .eq("organization_id", org.id)
    .in("status", ["PURCHASE_REQUIRED", "PURCHASING"])
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Error al obtener pedidos en compra: ${error.message}`);
  }

  const poIds = (data ?? [])
    .map((r: { purchase_order_id: string | null }) => r.purchase_order_id)
    .filter((id): id is string => id !== null);

  const poMap = new Map<string, string>();
  if (poIds.length > 0) {
    const { data: pos } = await supabase
      .from("purchase_orders")
      .select("id, purchase_number")
      .in("id", poIds);

    if (pos) {
      for (const po of pos) {
        poMap.set(po.id, `OC-${String(po.purchase_number).padStart(4, "0")}`);
      }
    }
  }

  return (data ?? []).map(
    (row: {
      id: string;
      order_number: string;
      status: string;
      purchase_order_id: string | null;
      parent_order_id: string | null;
      parent: {
        order_number: string;
        quotes: {
          customers: {
            business_name: string;
            fantasy_name: string | null;
          } | null;
        } | null;
      } | null;
      own_quote: {
        customers: {
          business_name: string;
          fantasy_name: string | null;
        } | null;
      } | null;
      assigned_items: Array<{
        id: string;
        description: string | null;
        quantity: number;
        product_id: string | null;
        product_variant_id: string | null;
      }>;
    }): PurchasingOrder => {
      const isChild = row.parent_order_id !== null;
      const customerName = isChild
        ? (row.parent?.quotes?.customers?.fantasy_name ??
          row.parent?.quotes?.customers?.business_name ??
          "—")
        : (row.own_quote?.customers?.fantasy_name ??
          row.own_quote?.customers?.business_name ??
          "—");

      return {
        id: row.id,
        order_number: row.order_number,
        status: row.status as OrderFlowStatus,
        parent_order_id: row.parent_order_id,
        parent_order_number: isChild
          ? (row.parent?.order_number ?? "—")
          : row.order_number,
        parent_customer_name: customerName,
        purchase_order_id: row.purchase_order_id,
        purchase_order_number: row.purchase_order_id
          ? (poMap.get(row.purchase_order_id) ?? null)
          : null,
        items: (row.assigned_items ?? []).map((item) => ({
          id: item.id,
          description: item.description ?? "—",
          quantity: item.quantity,
          product_id: item.product_id,
          product_variant_id: item.product_variant_id,
        })),
      };
    }
  );
}

export async function getChildOrdersForDispatch(
  orgSlug: string
): Promise<ChildOrderForDispatch[]> {
  const supabase = await createClient();
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    return [];
  }

  const { data: rawOrders, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, parent_order_id, quote_id, sales_order_id"
    )
    .eq("organization_id", org.id)
    .in("status", ["PREPARING", "DISPATCHED", "DELIVERED"])
    .order("order_number", { ascending: true });

  if (error) {
    throw new Error(`Error al obtener pedidos para despacho: ${error.message}`);
  }

  if (!rawOrders || rawOrders.length === 0) {
    return [];
  }

  // Excluir padres que tienen hijos activos (no deben aparecer como pedidos individuales)
  const parentIdsWithChildren = await getParentIdsWithChildren(
    supabase,
    org.id
  );

  const visibleOrders = rawOrders.filter(
    (o) => o.parent_order_id !== null || !parentIdsWithChildren.has(o.id)
  );

  const lookupIds = [
    ...new Set(visibleOrders.map((o) => o.parent_order_id ?? o.id)),
  ];

  const parentMap = await loadDispatchParents(supabase, lookupIds);

  const orderIdsWithItems = visibleOrders
    .filter((o) => o.parent_order_id !== null)
    .map((o) => o.id);
  // Para standalone orders, cargar items por su propio ID
  const standaloneIds = visibleOrders
    .filter((o) => o.parent_order_id === null)
    .map((o) => o.id);

  const itemMap = await loadDispatchItems(
    supabase,
    orderIdsWithItems,
    standaloneIds
  );

  return visibleOrders.map((o) => {
    const parent = parentMap.get(o.parent_order_id ?? o.id);

    return {
      id: o.id,
      order_number: o.order_number,
      status: o.status as ChildOrderForDispatch["status"],
      parent_order_id: o.parent_order_id ?? o.id,
      parent_order_number: parent?.order_number ?? o.order_number,
      parent_customer_name: parent?.customer_name ?? "—",
      parent_sales_order_id: parent?.sales_order_id ?? o.sales_order_id ?? null,
      items: itemMap.get(o.id) ?? [],
    };
  });
}

async function getParentIdsWithChildren(
  supabase: SupabaseClient<Database>,
  orgId: string
): Promise<Set<string>> {
  const { data } = await supabase
    .from("orders")
    .select("parent_order_id")
    .eq("organization_id", orgId)
    .not("parent_order_id", "is", null);

  const parentIds: string[] = [];
  for (const row of data ?? []) {
    if (row.parent_order_id !== null) {
      parentIds.push(row.parent_order_id);
    }
  }
  return new Set(parentIds);
}

async function loadDispatchParents(
  supabase: SupabaseClient<Database>,
  parentIds: string[]
): Promise<
  Map<
    string,
    {
      order_number: string;
      sales_order_id: string | null;
      customer_name: string;
    }
  >
> {
  const map = new Map<
    string,
    {
      order_number: string;
      sales_order_id: string | null;
      customer_name: string;
    }
  >();

  if (parentIds.length === 0) {
    return map;
  }

  const { data: parents } = await supabase
    .from("orders")
    .select(
      `
      id,
      order_number,
      sales_order_id,
      quotes!inner(
        customers(
          business_name,
          fantasy_name
        )
      )
    `
    )
    .in("id", parentIds);

  if (!parents) {
    return map;
  }

  for (const p of parents as unknown as Array<{
    id: string;
    order_number: string;
    sales_order_id: string | null;
    quotes: {
      customers: {
        business_name: string;
        fantasy_name: string | null;
      };
    } | null;
  }>) {
    const customer = p.quotes?.customers;
    map.set(p.id, {
      order_number: p.order_number,
      sales_order_id: p.sales_order_id ?? null,
      customer_name: customer?.fantasy_name ?? customer?.business_name ?? "—",
    });
  }

  return map;
}

async function loadDispatchItems(
  supabase: SupabaseClient<Database>,
  childOrderIds: string[],
  standaloneIds: string[] = []
): Promise<
  Map<string, Array<{ id: string; description: string; quantity: number }>>
> {
  const map = new Map<
    string,
    Array<{ id: string; description: string; quantity: number }>
  >();

  const allIds = [...childOrderIds, ...standaloneIds];

  if (allIds.length === 0) {
    return map;
  }

  const { data: items } = await supabase
    .from("quote_items")
    .select("id, description, quantity, assigned_order_id")
    .in("assigned_order_id", allIds);

  if (!items) {
    return map;
  }

  for (const item of items as unknown as Array<{
    id: string;
    description: string;
    quantity: number;
    assigned_order_id: string;
  }>) {
    const group = map.get(item.assigned_order_id);
    if (group) {
      group.push(item);
    } else {
      map.set(item.assigned_order_id, [
        {
          id: item.id,
          description: item.description,
          quantity: item.quantity,
        },
      ]);
    }
  }

  return map;
}

export async function getOrderById(
  orgSlug: string,
  orderId: string
): Promise<OrderWithChildren | null> {
  const supabase = await createClient();
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    return null;
  }

  const { data, error } = await supabase
    .from("orders")
    .select(
      `
      *,
      quotes!inner(
        id,
        total_amount,
        currency,
        payment_condition,
        observations,
        customers(
          business_name,
          fantasy_name
        ),
        quote_items(
          id,
          description,
          quantity,
          unit_price,
          subtotal,
          product_id,
          product_variant_id,
          assigned_order_id
        )
      ),
      order_status_history(*),
      order_designs(*)
    `
    )
    .eq("id", orderId)
    .eq("organization_id", org.id)
    .single();

  if (error) {
    throw new Error(`Error al obtener el pedido: ${error.message}`);
  }

  const order = data as OrderWithHistory & {
    order_status_history?: Record<string, unknown>[];
  };

  if (order.order_status_history && order.order_status_history.length > 0) {
    const { data: members } = await supabase.rpc(
      "get_organization_members_with_users",
      { org_slug_param: orgSlug }
    );

    const userMap = new Map<string, string>();
    if (members) {
      for (const m of members as {
        user_id: string;
        full_name: string | null;
      }[]) {
        if (m.full_name) {
          userMap.set(m.user_id, m.full_name);
        }
      }
    }

    order.order_status_history = order.order_status_history.map((h) => ({
      ...h,
      changed_by_name: h.changed_by
        ? (userMap.get(h.changed_by as string) ?? null)
        : null,
    })) as OrderStatusHistoryRowWithUser[];
  }

  const { data: childrenData } = await supabase
    .from("orders")
    .select("id, order_number, status, created_at, observations")
    .eq("parent_order_id", orderId)
    .eq("organization_id", org.id)
    .order("created_at", { ascending: true });

  const result = order as unknown as OrderWithChildren;
  result.children = (childrenData ?? []) as ChildOrderSummary[];

  filterQuoteItemsForChildOrder(result, orderId);

  return result;
}

function filterQuoteItemsForChildOrder(
  order: OrderWithChildren,
  orderId: string
): void {
  if (!order.parent_order_id) {
    return;
  }
  if (!order.quotes?.quote_items) {
    return;
  }
  order.quotes.quote_items = order.quotes.quote_items.filter(
    (item) => item.assigned_order_id === orderId
  );
}

export async function getOrderCounts(
  orgSlug: string
): Promise<OrderAreaCounts> {
  const supabase = await createClient();
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    return { finance: 0, stock: 0, production: 0, dispatch: 0, total: 0 };
  }

  const { data, error } = await supabase
    .from("orders")
    .select("id, status, parent_order_id")
    .eq("organization_id", org.id)
    .not("status", "in", '("DELIVERED","CANCELLED","FINANCE_REJECTED")');

  if (error || !data) {
    return { finance: 0, stock: 0, production: 0, dispatch: 0, total: 0 };
  }

  const parentIdsWithChildren = await getParentIdsWithChildren(
    supabase,
    org.id
  );

  const visibleOrders = data.filter(
    (o) => o.parent_order_id !== null || !parentIdsWithChildren.has(o.id ?? "")
  );

  const finance = visibleOrders.filter(
    (o) => o.status === "PENDING_FINANCE"
  ).length;
  const stock = visibleOrders.filter((o) =>
    [
      "PENDING_STOCK",
      "STOCK_OK",
      "PURCHASE_REQUIRED",
      "PURCHASING",
      "GOODS_RECEIVED",
    ].includes(o.status)
  ).length;
  const production = visibleOrders.filter((o) =>
    ["IN_PRODUCTION", "DESIGN_REVIEW"].includes(o.status)
  ).length;
  const dispatch = visibleOrders.filter((o) =>
    ["PREPARING", "DISPATCHED"].includes(o.status)
  ).length;

  return {
    finance,
    stock,
    production,
    dispatch,
    total: visibleOrders.length,
  };
}

export async function getStockForOrder(
  orgSlug: string,
  items: Array<{ productId: string; quantityNeeded: number }>
): Promise<StockInfo[]> {
  const supabase = await createClient();
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id || items.length === 0) {
    return [];
  }

  const productIds = items.map((i) => i.productId);

  const { data: stockData, error } = await supabase
    .from("view_stock_detail")
    .select("product_id, product_name, total_stock")
    .eq("organization_id", org.id)
    .in("product_id", productIds);

  if (error) {
    throw new Error(`Error al consultar stock: ${error.message}`);
  }

  return items.map((item) => {
    const stock = stockData?.find((s) => s.product_id === item.productId);
    const stockAvailable = stock?.total_stock ?? 0;

    return {
      product_id: item.productId,
      product_name: stock?.product_name ?? "Desconocido",
      quantity_needed: item.quantityNeeded,
      stock_available: stockAvailable,
      has_stock: stockAvailable >= item.quantityNeeded,
    };
  });
}

export async function createOrderAndSaleFromQuote(
  orgSlug: string,
  quoteId: string
): Promise<{ orderId: string; orderNumber: string; salesOrderId: string }> {
  const supabase = await createClient();
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("No autorizado");
  }

  const { data: quoteData } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", quoteId)
    .single();

  const purchaseOrderFile =
    (quoteData as { purchase_order_file?: string | null } | null)
      ?.purchase_order_file ?? null;

  const salesOrderId = await convertQuoteToSalesOrder(quoteId, orgSlug);

  const year = new Date().getFullYear();

  const { count, error: countError } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", org.id)
    .gte("created_at", `${year}-01-01T00:00:00Z`);

  if (countError) {
    throw new Error(`Error al generar número de pedido: ${countError.message}`);
  }

  const sequence = String((count ?? 0) + 1).padStart(4, "0");
  const orderNumber = `ORD-${year}-${sequence}`;

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      organization_id: org.id,
      quote_id: quoteId,
      sales_order_id: salesOrderId,
      order_number: orderNumber,
      status: "PENDING_FINANCE",
      purchase_order_file: purchaseOrderFile,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (orderError || !order) {
    throw new Error(
      `Error al crear el pedido: ${orderError?.message ?? "Error desconocido"}`
    );
  }

  const { error: historyError } = await supabase
    .from("order_status_history")
    .insert({
      order_id: order.id,
      to_status: "PENDING_FINANCE",
      notes: "Pedido creado desde presupuesto aprobado",
      changed_by: user.id,
      changed_at: new Date().toISOString(),
    });

  if (historyError) {
    throw new Error(`Error al registrar historial: ${historyError.message}`);
  }

  return { orderId: order.id, orderNumber, salesOrderId };
}

export async function updateOrderStatus(
  orgSlug: string,
  input: {
    orderId: string;
    newStatus: OrderFlowStatus;
    userId: string;
    notes?: string;
    extraFields?: Record<string, unknown>;
  }
): Promise<void> {
  const supabase = await createClient();
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const { orderId, newStatus, userId, notes, extraFields } = input;

  const { data: currentOrder, error: fetchError } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .eq("organization_id", org.id)
    .single();

  if (fetchError || !currentOrder) {
    throw new Error("Pedido no encontrado");
  }

  const previousStatus = currentOrder.status;

  const updatePayload: Record<string, unknown> = {
    status: newStatus,
    updated_at: new Date().toISOString(),
    ...extraFields,
  };

  const { error: updateError } = await supabase
    .from("orders")
    .update(updatePayload)
    .eq("id", orderId)
    .eq("organization_id", org.id);

  if (updateError) {
    throw new Error(`Error al actualizar el pedido: ${updateError.message}`);
  }

  const { error: historyError } = await supabase
    .from("order_status_history")
    .insert({
      order_id: orderId,
      from_status: previousStatus,
      to_status: newStatus,
      notes: notes ?? null,
      changed_by: userId,
      changed_at: new Date().toISOString(),
    });

  if (historyError) {
    throw new Error(`Error al registrar el historial: ${historyError.message}`);
  }
}

export async function saveOrderDesign(
  orderId: string,
  designData: {
    products?: OrderDesignProduct[];
    general_notes?: string;
  },
  userId: string
): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase.from("order_designs").upsert(
    {
      order_id: orderId,
      products: designData.products ?? [],
      general_notes: designData.general_notes ?? null,
      created_by: userId,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "order_id",
    }
  );

  if (error) {
    throw new Error(`Error al guardar el diseño: ${error.message}`);
  }
}

export function computeOrderMetrics(orders: OrderWithDetails[]): OrderMetrics {
  const total = orders.length;
  const inProgress = orders.filter(
    (o) => !["DELIVERED", "CANCELLED", "FINANCE_REJECTED"].includes(o.status)
  ).length;
  const requiresAction = orders.filter((o) =>
    [
      "PENDING_FINANCE",
      "PENDING_STOCK",
      "PURCHASE_REQUIRED",
      "DESIGN_REVIEW",
    ].includes(o.status)
  ).length;
  const delivered = orders.filter((o) => o.status === "DELIVERED").length;
  return { total, inProgress, requiresAction, delivered };
}

function buildOrdersQuery(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  params: OrdersPaginatedParams
) {
  const page = Math.max(1, params.page);
  const pageSize = Math.min(100, Math.max(1, params.pageSize));

  const ALLOWED_SORT_COLUMNS: string[] = [
    "order_number",
    "customer_name",
    "status",
    "created_at",
    "total_amount",
  ];
  const sort = (params.sort ?? []).filter((s) =>
    ALLOWED_SORT_COLUMNS.includes(s.id)
  );

  let query = supabase
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
    `,
      { count: "exact" }
    )
    .eq("organization_id", orgId)
    .is("parent_order_id", null);

  if (params.status) {
    query = query.eq("status", params.status);
  }

  if (params.search) {
    query = query.or(`order_number.ilike.%${params.search}%`);
  }

  if (sort && sort.length > 0) {
    for (const s of sort) {
      query = query.order(s.id, { ascending: !s.desc });
    }
  } else {
    query = query.order("created_at", { ascending: false });
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  return query;
}

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
    total_amount: number;
    currency: string;
    payment_condition: string | null;
    customers: {
      business_name: string;
      fantasy_name: string | null;
    } | null;
  } | null;
};

function enrichOrderItems(
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

export async function getOrdersPaginated(
  orgSlug: string,
  params: OrdersPaginatedParams
): Promise<PaginatedResult<OrderPaginatedItem>> {
  const page = Math.max(1, params.page);
  const pageSize = Math.min(100, Math.max(1, params.pageSize));

  const supabase = await createClient();
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    return {
      data: [],
      totalCount: 0,
      page,
      pageSize,
    };
  }

  const query = buildOrdersQuery(supabase, org.id, params);
  const { data, error, count } = await query;

  if (error || !data) {
    return {
      data: [],
      totalCount: count ?? 0,
      page,
      pageSize,
    };
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

  return {
    data: enrichOrderItems(
      data as RawOrderRow[],
      childrenByParent,
      itemsCountMap
    ),
    totalCount: count ?? 0,
    page,
    pageSize,
  };
}

export async function getOrdersMetrics(orgSlug: string): Promise<OrderMetrics> {
  const supabase = await createClient();
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    return { total: 0, inProgress: 0, requiresAction: 0, delivered: 0 };
  }

  const baseQuery = () =>
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .is("parent_order_id", null);

  const actionStatuses: OrderFlowStatus[] = [
    "PENDING_FINANCE",
    "PENDING_STOCK",
    "PURCHASE_REQUIRED",
    "DESIGN_REVIEW",
  ];

  const [total, inProgress, requiresAction, delivered] = await Promise.all([
    baseQuery(),
    baseQuery().not(
      "status",
      "in",
      '("DELIVERED","CANCELLED","FINANCE_REJECTED")'
    ),
    baseQuery().in("status", actionStatuses),
    baseQuery().eq("status", "DELIVERED"),
  ]);

  return {
    total: total.count ?? 0,
    inProgress: inProgress.count ?? 0,
    requiresAction: requiresAction.count ?? 0,
    delivered: delivered.count ?? 0,
  };
}

export function computeDispatchMetrics(
  orders: { status: string }[]
): DispatchMetrics {
  return {
    preparing: orders.filter((o) => o.status === "PREPARING").length,
    inTransit: orders.filter((o) => o.status === "DISPATCHED").length,
    delivered: orders.filter((o) => o.status === "DELIVERED").length,
  };
}

const CHILD_STATUS_PRIORITY: Record<OrderFlowStatus, number> = {
  PENDING_FINANCE: 0,
  FINANCE_REJECTED: 0,
  STOCK_OK: 0,
  PURCHASE_REQUIRED: 1,
  PURCHASING: 2,
  GOODS_RECEIVED: 3,
  PENDING_STOCK: 4,
  IN_PRODUCTION: 5,
  DESIGN_REVIEW: 6,
  PREPARING: 7,
  DISPATCHED: 8,
  DELIVERED: 9,
  CANCELLED: 10,
};

const ORDER_TO_SALE_STATUS: Record<string, SalesOrderStatus> = {
  PENDING_FINANCE: "DRAFT",
  FINANCE_REJECTED: "DRAFT",
  PENDING_STOCK: "INCOMPLETE",
  STOCK_OK: "CONFIRMED",
  PURCHASE_REQUIRED: "CONFIRMED",
  PURCHASING: "CONFIRMED",
  GOODS_RECEIVED: "CONFIRMED",
  IN_PRODUCTION: "CONFIRMED",
  DESIGN_REVIEW: "CONFIRMED",
  PREPARING: "CONFIRMED",
  DISPATCHED: "DISPATCH",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED",
};

export async function syncSaleStatus(
  supabase: SupabaseClient<Database>,
  saleId: string,
  orgId: string,
  newStatus: string
): Promise<void> {
  if (newStatus === "STOCK_OK") {
    const { data: sale } = await supabase
      .from("sales_orders")
      .select("status")
      .eq("id", saleId)
      .single();
    if (sale?.status === "CONFIRMED") {
      return;
    }
    await confirmIncompleteSaleWithStockDeduction(supabase, orgId, saleId);
    return;
  }

  const saleStatus = ORDER_TO_SALE_STATUS[newStatus];
  if (!saleStatus) {
    return;
  }

  if (saleStatus === "DISPATCH") {
    await dispatchSaleFromOrders(supabase, orgId, saleId);
    return;
  }

  const { error } = await supabase
    .from("sales_orders")
    .update({ status: saleStatus, updated_at: new Date().toISOString() })
    .eq("id", saleId)
    .eq("organization_id", orgId);

  if (error) {
    throw new Error(`Error al sincronizar estado de venta: ${error.message}`);
  }
}

const ROUTE_INITIAL_STATUS: Record<ChildOrderRoute, OrderFlowStatus> = {
  direct: "PREPARING",
  production: "IN_PRODUCTION",
  purchase: "PURCHASE_REQUIRED",
};

export async function recalcParentOrderStatus(
  parentOrderId: string,
  orgId: string
): Promise<{ salesOrderId: string | null }> {
  const supabase = await createClient();

  const { data: parent } = await supabase
    .from("orders")
    .select("status, quote_id, sales_order_id")
    .eq("id", parentOrderId)
    .eq("organization_id", orgId)
    .single();

  const parentSaleId: string | null = parent?.sales_order_id ?? null;

  if (!parent) {
    return { salesOrderId: parentSaleId };
  }

  // Si hay items sueltos, el padre vuelve a PENDING_STOCK
  if (parent.quote_id) {
    const { count } = await supabase
      .from("quote_items")
      .select("id", { count: "exact", head: true })
      .eq("quote_id", parent.quote_id)
      .is("assigned_order_id", null);

    if (count && count > 0) {
      await updateParentOrderStatus("PENDING_STOCK", parentOrderId, orgId);

      if (parentSaleId) {
        await syncSaleStatus(supabase, parentSaleId, orgId, "PENDING_STOCK");
      }

      return { salesOrderId: parentSaleId };
    }
  }

  const { data: children, error: fetchError } = await supabase
    .from("orders")
    .select("id, status")
    .eq("parent_order_id", parentOrderId)
    .eq("organization_id", orgId);

  if (fetchError) {
    throw new Error(`Error al obtener hijos del pedido: ${fetchError.message}`);
  }

  // Sin hijos → padre mantiene su propio status
  if (!children || children.length === 0) {
    return { salesOrderId: parentSaleId };
  }

  const terminalStatuses: OrderFlowStatus[] = ["DELIVERED", "CANCELLED"];
  const nonTerminalChildren = children.filter(
    (c) => !terminalStatuses.includes(c.status as OrderFlowStatus)
  );

  let newStatus = setPriority(
    CHILD_STATUS_PRIORITY,
    nonTerminalChildren,
    children
  );

  if (
    newStatus === "PURCHASE_REQUIRED" &&
    children.some((c) => c.status === "GOODS_RECEIVED")
  ) {
    newStatus = "GOODS_RECEIVED";
  }

  await updateParentOrderStatus(newStatus, parentOrderId, orgId);

  // Sincronizar venta vinculada al padre
  if (parentSaleId) {
    await syncSaleStatus(supabase, parentSaleId, orgId, newStatus);
  }

  return { salesOrderId: parentSaleId };
}

async function copyDesignFromQuoteToOrder(
  supabase: SupabaseClient<Database>,
  quoteId: string,
  orderId: string,
  userId: string
): Promise<void> {
  const { data: quoteData } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", quoteId)
    .single();

  if (!quoteData?.design_file_url) {
    return;
  }

  const designFileUrl = quoteData.design_file_url;
  const existingDesign = await supabase
    .from("order_designs")
    .select("id, products")
    .eq("order_id", orderId)
    .maybeSingle();

  const products: OrderDesignProduct[] =
    (existingDesign.data?.products as OrderDesignProduct[] | null) ?? [];

  if (products.length > 0) {
    products[0] = { ...products[0], reference_image: designFileUrl };
  } else {
    products.push({
      product_id: null,
      product_name: "Diseño desde presupuesto",
      quantity: 0,
      size: "",
      logo_position: "",
      logo_description: "",
      personalization_type: [],
      colors: "",
      reflective_tape: false,
      reflective_tape_position: "",
      additional_notes: "",
      reference_image: designFileUrl,
    });
  }

  await saveOrderDesign(orderId, { products }, userId);
}

async function getValidatedSetup(
  supabase: SupabaseClient<Database>,
  orgSlug: string,
  parentOrderId: string
): Promise<{
  orgId: string;
  parentOrder: {
    id: string;
    organization_id: string;
    quote_id: string;
    order_number: string;
  };
  userId: string;
}> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("No autorizado");
  }

  const { data: parentOrder, error: parentError } = await supabase
    .from("orders")
    .select("id, organization_id, quote_id, order_number")
    .eq("id", parentOrderId)
    .eq("organization_id", org.id)
    .single();

  if (parentError || !parentOrder) {
    throw new Error("Pedido padre no encontrado");
  }
  if (!parentOrder.quote_id) {
    throw new Error("El pedido padre no tiene un presupuesto asociado");
  }

  return { orgId: org.id, parentOrder, userId: user.id };
}

async function validateItemAssignment(
  supabase: SupabaseClient<Database>,
  quoteItemIds: string[],
  sourceChildOrderId?: string
): Promise<void> {
  if (sourceChildOrderId) {
    const { count } = await supabase
      .from("quote_items")
      .select("id", { count: "exact", head: true })
      .in("id", quoteItemIds)
      .neq("assigned_order_id", sourceChildOrderId);

    if (count && count > 0) {
      throw new Error("Uno o más items no pertenecen al pedido hijo de origen");
    }
  } else {
    const { data: items } = await supabase
      .from("quote_items")
      .select("id, assigned_order_id")
      .in("id", quoteItemIds);

    if (!items || items.length !== quoteItemIds.length) {
      throw new Error("Uno o más items del presupuesto no fueron encontrados");
    }

    const sourceIds = [
      ...new Set(
        items
          .map((i) => i.assigned_order_id)
          .filter((id): id is string => id !== null)
      ),
    ];

    if (sourceIds.length === 0) {
      return;
    }

    const { data: sourceOrders } = await supabase
      .from("orders")
      .select("id, status")
      .in("id", sourceIds);

    const blocked = (sourceOrders ?? []).filter(
      (o) => o.status !== "GOODS_RECEIVED"
    );

    if (blocked.length > 0) {
      throw new Error(
        "Uno o más items ya están asignados a otro pedido hijo que no fue recibido"
      );
    }
  }
}

async function fetchVariantStockMap(
  supabase: SupabaseClient<Database>,
  variantIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (variantIds.length === 0) {
    return map;
  }

  const { data: variantData } = await supabase
    .from("product_variants")
    .select("id, product_lots(quantity_available)")
    .in("id", variantIds);

  for (const v of variantData ?? []) {
    const stock =
      (
        v as {
          product_lots?: { quantity_available: number } | null;
        }
      ).product_lots?.quantity_available ?? 0;
    map.set(v.id, stock);
  }

  return map;
}

export async function validateStockForItems(params: {
  supabase: SupabaseClient<Database>;
  orgId: string;
  quoteItemIds: string[];
  route: ChildOrderRoute;
  quantities?: Record<string, number>;
}): Promise<void> {
  const { supabase, orgId, quoteItemIds, route, quantities } = params;
  if (route === "purchase") {
    return;
  }

  const { data: items, error: itemsError } = await supabase
    .from("quote_items")
    .select("id, product_id, product_variant_id, quantity, description")
    .in("id", quoteItemIds);

  if (itemsError) {
    throw new Error(`Error al consultar items: ${itemsError.message}`);
  }

  if (!items || items.length === 0) {
    return;
  }

  const productIds = items
    .map((i) => i.product_id)
    .filter((id): id is string => id !== null);

  if (productIds.length === 0) {
    return;
  }

  const { data: stockData } = await supabase
    .from("view_stock_detail")
    .select("product_id, total_stock")
    .eq("organization_id", orgId)
    .in("product_id", productIds);

  const productStockMap = new Map(
    (stockData ?? []).map((s) => [s.product_id, s.total_stock])
  );

  const variantIds = items
    .map((i) => i.product_variant_id)
    .filter((id): id is string => id !== null);

  const variantStockMap = await fetchVariantStockMap(supabase, variantIds);

  const routeLabel = route === "direct" ? "despacho" : "producción";
  const insufficientItems = items
    .filter(
      (item): item is typeof item & { product_id: string } =>
        item.product_id !== null
    )
    .filter((item) => {
      const needed = quantities?.[item.id] ?? item.quantity;
      const stockAvailable = item.product_variant_id
        ? (variantStockMap.get(item.product_variant_id) ?? 0)
        : (productStockMap.get(item.product_id) ?? 0);

      return stockAvailable < needed;
    })
    .map((item) => {
      const needed = quantities?.[item.id] ?? item.quantity;
      return `${item.description || item.product_id} (necesario: ${needed})`;
    });

  if (insufficientItems.length > 0) {
    throw new Error(
      `No hay stock suficiente para enviar a ${routeLabel}. Items sin stock: ${insufficientItems.join(", ")}`
    );
  }
}

export type StockLotUpdate = {
  id: string;
  organization_id: string;
  product_id: string;
  lot_number: string;
  expiration_date: string | null;
  quantity_available: number;
  unit_quantity_available?: number | null;
  updated_at: string;
};

type StockMovementPayload = {
  organization_id: string;
  lot_id: string;
  type: Database["public"]["Enums"]["stock_movement_type"];
  quantity: number;
  previous_stock: number;
  new_stock: number;
  unit_quantity?: number | null;
  reason: string;
};

type DeductionContext = {
  lotUpdates: StockLotUpdate[];
  rollbackLotUpdates: StockLotUpdate[];
  movementPayloads: StockMovementPayload[];
  snapshotKeys: Set<string>;
  timestamp: string;
  orgId: string;
  movementReason: string;
};

type LotDeduction = {
  id: string | null;
  product_id: string | null;
  quantity_available: number | null;
  unit_quantity_available: number | null;
  lot_number: string | null;
  expiration_date: string | null;
};

type StockItemInput = {
  product_id: string;
  product_variant_id: string | null;
  quantity: number;
  description: string | null;
};

function pushVariantDeduction(
  item: StockItemInput,
  lot: LotDeduction,
  ctx: DeductionContext
) {
  const lotId = lot.id;
  if (!lotId) {
    throw new Error(
      `El lote de la variante de ${item.description || item.product_id} no tiene ID`
    );
  }

  const prev = Math.max(0, lot.quantity_available ?? 0);

  if (prev < item.quantity) {
    throw new Error(
      `No hay stock suficiente para ${item.description || item.product_id}. Disponible: ${prev}, necesario: ${item.quantity}`
    );
  }

  const next = Math.max(0, prev - item.quantity);

  if (!ctx.snapshotKeys.has(lotId)) {
    ctx.snapshotKeys.add(lotId);
    ctx.rollbackLotUpdates.push({
      id: lotId,
      organization_id: ctx.orgId,
      product_id: lot.product_id as string,
      lot_number: lot.lot_number ?? "DEFAULT",
      expiration_date: lot.expiration_date,
      quantity_available: prev,
      unit_quantity_available: lot.unit_quantity_available ?? undefined,
      updated_at: ctx.timestamp,
    });
  }

  ctx.lotUpdates.push({
    id: lotId,
    organization_id: ctx.orgId,
    product_id: lot.product_id as string,
    lot_number: lot.lot_number ?? "DEFAULT",
    expiration_date: lot.expiration_date,
    quantity_available: next,
    updated_at: ctx.timestamp,
  });

  ctx.movementPayloads.push({
    organization_id: ctx.orgId,
    lot_id: lotId,
    type: "OUTBOUND",
    quantity: item.quantity,
    previous_stock: prev,
    new_stock: next,
    reason: ctx.movementReason,
  });
}

function pushFifoDeduction(
  item: StockItemInput,
  productLots: LotDeduction[],
  ctx: DeductionContext
) {
  let remaining = item.quantity;

  for (const lot of productLots) {
    if (remaining <= 0) {
      break;
    }

    const lotId = lot.id;
    if (!lotId) {
      continue;
    }

    const prev = Math.max(0, lot.quantity_available ?? 0);
    if (prev <= 0) {
      continue;
    }

    const toConsume = Math.min(prev, remaining);

    if (!ctx.snapshotKeys.has(lotId)) {
      ctx.snapshotKeys.add(lotId);
      ctx.rollbackLotUpdates.push({
        id: lotId,
        organization_id: ctx.orgId,
        product_id: lot.product_id as string,
        lot_number: lot.lot_number ?? "DEFAULT",
        expiration_date: lot.expiration_date,
        quantity_available: prev,
        unit_quantity_available: lot.unit_quantity_available ?? undefined,
        updated_at: ctx.timestamp,
      });
    }

    const next = Math.max(0, prev - toConsume);

    ctx.lotUpdates.push({
      id: lotId,
      organization_id: ctx.orgId,
      product_id: lot.product_id as string,
      lot_number: lot.lot_number ?? "DEFAULT",
      expiration_date: lot.expiration_date,
      quantity_available: next,
      updated_at: ctx.timestamp,
    });

    ctx.movementPayloads.push({
      organization_id: ctx.orgId,
      lot_id: lotId,
      type: "OUTBOUND",
      quantity: toConsume,
      previous_stock: prev,
      new_stock: next,
      reason: ctx.movementReason,
    });

    remaining -= toConsume;
  }

  if (remaining > 0) {
    throw new Error(
      `No se pudo asignar stock suficiente para ${item.description || item.product_id}`
    );
  }
}

async function fetchLotData(
  supabase: SupabaseClient<Database>,
  orgId: string,
  productIds: string[],
  variantIds: string[]
): Promise<{
  lots: LotDeduction[];
  variantLotMap: Map<string, string>;
  lotsByProduct: Map<string, LotDeduction[]>;
}> {
  const { data: lots, error: lotsError } = await supabase
    .from("product_lots")
    .select(
      "id, product_id, quantity_available, unit_quantity_available, lot_number, expiration_date, created_at"
    )
    .eq("organization_id", orgId)
    .in("product_id", productIds)
    .order("expiration_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (lotsError) {
    throw new Error(`Error al consultar lotes: ${lotsError.message}`);
  }

  const variantLotMap = new Map<string, string>();
  if (variantIds.length > 0) {
    const { data: variants } = await supabase
      .from("product_variants")
      .select("id, lot_id")
      .eq("organization_id", orgId)
      .in("id", variantIds);

    for (const v of variants ?? []) {
      if (v.id && v.lot_id) {
        variantLotMap.set(v.id, v.lot_id);
      }
    }
  }

  const lotsByProduct = new Map<string, LotDeduction[]>();
  for (const lot of lots ?? []) {
    if (!lot.product_id) {
      continue;
    }
    const list = lotsByProduct.get(lot.product_id) ?? [];
    list.push(lot as LotDeduction);
    lotsByProduct.set(lot.product_id, list);
  }

  return { lots: (lots ?? []) as LotDeduction[], variantLotMap, lotsByProduct };
}

async function persistStockDeductions(
  supabase: SupabaseClient<Database>,
  ctx: DeductionContext
): Promise<{ movementIds: string[]; lotUpdates: StockLotUpdate[] }> {
  if (ctx.lotUpdates.length === 0) {
    return { movementIds: [], lotUpdates: [] };
  }

  const { error: lotError } = await supabase
    .from("product_lots")
    .upsert(ctx.lotUpdates);

  if (lotError) {
    throw new Error(`No se pudo descontar el stock: ${lotError.message}`);
  }

  const { data: movements, error: movementError } = await supabase
    .from("stock_movements")
    .insert(ctx.movementPayloads)
    .select("id");

  if (movementError) {
    await supabase.from("product_lots").upsert(ctx.rollbackLotUpdates);
    throw new Error(
      `No se pudo registrar el movimiento de stock: ${movementError.message}`
    );
  }

  return {
    movementIds: (movements ?? [])
      .map((m) => m.id)
      .filter((id): id is string => Boolean(id)),
    lotUpdates: ctx.lotUpdates,
  };
}

function resolveDeductionLot(
  item: {
    product_variant_id: string | null;
    product_id?: string | null;
    description?: string | null;
  },
  lotData: {
    lots: LotDeduction[];
    variantLotMap: Map<string, string>;
    lotsByProduct: Map<string, LotDeduction[]>;
  }
): LotDeduction[] | LotDeduction {
  if (item.product_variant_id) {
    const variantLotId = lotData.variantLotMap.get(item.product_variant_id);
    if (!variantLotId) {
      throw new Error(
        `No se encontró el lote para la variante de ${item.description || item.product_id}`
      );
    }
    const variantLot = lotData.lots.find((l) => l.id === variantLotId);
    if (!variantLot) {
      throw new Error(
        `No hay lote de stock para la variante de ${item.description || item.product_id}`
      );
    }
    return variantLot;
  }

  const productLots = lotData.lotsByProduct.get(item.product_id ?? "") ?? [];
  if (productLots.length === 0) {
    throw new Error(
      `No hay stock disponible para ${item.description || item.product_id}`
    );
  }
  return productLots;
}

function processDeductionItems(
  stockItems: StockItemInput[],
  lotData: {
    lots: LotDeduction[];
    variantLotMap: Map<string, string>;
    lotsByProduct: Map<string, LotDeduction[]>;
  },
  ctx: DeductionContext
): void {
  for (const item of stockItems) {
    if (!item.product_id) {
      continue;
    }

    const resolved = resolveDeductionLot(item, lotData);

    if (item.product_variant_id) {
      pushVariantDeduction(item, resolved as LotDeduction, ctx);
    } else {
      pushFifoDeduction(item, resolved as LotDeduction[], ctx);
    }
  }
}

export async function deductStockForOrderItems(params: {
  supabase: SupabaseClient<Database>;
  orgId: string;
  quoteItemIds: string[];
  movementReason: string;
  quantities?: Record<string, number>;
}): Promise<{ movementIds: string[]; lotUpdates: StockLotUpdate[] }> {
  const { supabase, orgId, quoteItemIds, movementReason, quantities } = params;
  const { data: items, error: itemsError } = await supabase
    .from("quote_items")
    .select("id, product_id, product_variant_id, quantity, description")
    .in("id", quoteItemIds);

  if (itemsError) {
    throw new Error(
      `Error al consultar items para descuento: ${itemsError.message}`
    );
  }

  if (!items || items.length === 0) {
    return { movementIds: [], lotUpdates: [] };
  }

  const stockItems = items
    .filter((i) => i.product_id !== null)
    .map((i) => ({
      ...i,
      quantity: quantities?.[i.id] ?? i.quantity,
    }));
  if (stockItems.length === 0) {
    return { movementIds: [], lotUpdates: [] };
  }

  const productIds = [
    ...new Set(
      stockItems
        .map((i) => i.product_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const variantIds = stockItems
    .map((i) => i.product_variant_id)
    .filter((id): id is string => Boolean(id));

  const { lots, variantLotMap, lotsByProduct } = await fetchLotData(
    supabase,
    orgId,
    productIds,
    variantIds
  );

  const ctx: DeductionContext = {
    lotUpdates: [],
    rollbackLotUpdates: [],
    movementPayloads: [],
    snapshotKeys: new Set(),
    timestamp: new Date().toISOString(),
    orgId,
    movementReason,
  };

  processDeductionItems(
    stockItems as StockItemInput[],
    { lots, variantLotMap, lotsByProduct },
    ctx
  );

  return persistStockDeductions(supabase, ctx);
}

export async function rollbackStockDeduction(
  supabase: SupabaseClient<Database>,
  orgId: string,
  lotUpdates: StockLotUpdate[]
): Promise<void> {
  if (lotUpdates.length === 0) {
    return;
  }

  const rollbackSnapshots = lotUpdates.map((u) => ({
    id: u.id,
    organization_id: orgId,
    product_id: u.product_id,
    lot_number: u.lot_number ?? "DEFAULT",
    expiration_date: u.expiration_date,
    quantity_available: u.quantity_available,
    ...(u.unit_quantity_available != null
      ? { unit_quantity_available: u.unit_quantity_available }
      : {}),
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("product_lots")
    .upsert(rollbackSnapshots);

  if (error) {
    throw new Error(`Error al restaurar stock descontado: ${error.message}`);
  }
}

async function fetchLotsForRestore(
  supabase: SupabaseClient<Database>,
  orgId: string,
  productIds: string[],
  variantIds: string[]
): Promise<{
  variantLotMap: Map<string, string>;
  lotsByProduct: Map<string, LotDeduction[]>;
}> {
  const variantLotMap = new Map<string, string>();
  if (variantIds.length > 0) {
    const { data: variants } = await supabase
      .from("product_variants")
      .select("id, lot_id")
      .eq("organization_id", orgId)
      .in("id", variantIds);

    for (const v of variants ?? []) {
      if (v.id && v.lot_id) {
        variantLotMap.set(v.id, v.lot_id);
      }
    }
  }

  const { data: lots } = await supabase
    .from("product_lots")
    .select(
      "id, product_id, quantity_available, unit_quantity_available, lot_number, expiration_date"
    )
    .eq("organization_id", orgId)
    .in("product_id", productIds)
    .order("created_at", { ascending: true });

  const lotsByProduct = new Map<string, LotDeduction[]>();
  for (const lot of lots ?? []) {
    if (!lot.product_id) {
      continue;
    }
    const list = lotsByProduct.get(lot.product_id) ?? [];
    list.push(lot as LotDeduction);
    lotsByProduct.set(lot.product_id, list);
  }

  return { variantLotMap, lotsByProduct };
}

function buildRestoreLotUpdates(
  stockItems: Array<{
    product_id: string;
    product_variant_id: string | null;
    quantity: number;
    description: string | null;
  }>,
  options: {
    variantLotMap: Map<string, string>;
    lotsByProduct: Map<string, LotDeduction[]>;
    orgId: string;
    movementReason: string;
  }
): { lotUpdates: StockLotUpdate[]; movementPayloads: StockMovementPayload[] } {
  const { variantLotMap, lotsByProduct, orgId, movementReason } = options;
  const lotUpdates: StockLotUpdate[] = [];
  const movementPayloads: StockMovementPayload[] = [];
  const timestamp = new Date().toISOString();

  for (const item of stockItems) {
    let lotToRestore: LotDeduction | undefined;

    if (item.product_variant_id) {
      const variantLotId = variantLotMap.get(item.product_variant_id);
      if (!variantLotId) {
        continue;
      }
      lotToRestore = [...lotsByProduct.values()]
        .flat()
        .find((l) => l.id === variantLotId);
    } else {
      lotToRestore = lotsByProduct.get(item.product_id)?.[0];
    }

    if (!lotToRestore?.id) {
      continue;
    }

    const prevQuantity = Math.max(0, lotToRestore.quantity_available ?? 0);
    const newQuantity = prevQuantity + item.quantity;

    lotUpdates.push({
      id: lotToRestore.id,
      organization_id: orgId,
      product_id: lotToRestore.product_id as string,
      lot_number: lotToRestore.lot_number ?? "DEFAULT",
      expiration_date: lotToRestore.expiration_date,
      quantity_available: newQuantity,
      updated_at: timestamp,
    });

    movementPayloads.push({
      organization_id: orgId,
      lot_id: lotToRestore.id,
      type: "INBOUND",
      quantity: item.quantity,
      previous_stock: prevQuantity,
      new_stock: newQuantity,
      reason: movementReason,
    });
  }

  return { lotUpdates, movementPayloads };
}

export async function restoreStockForOrderItems(
  supabase: SupabaseClient<Database>,
  orgId: string,
  quoteItemIds: string[],
  movementReason: string
): Promise<void> {
  const { data: items, error: itemsError } = await supabase
    .from("quote_items")
    .select("id, product_id, product_variant_id, quantity, description")
    .in("id", quoteItemIds);

  if (itemsError) {
    throw new Error(
      `Error al consultar items para restauración: ${itemsError.message}`
    );
  }

  if (!items || items.length === 0) {
    return;
  }

  const stockItems = items.filter(
    (i): i is (typeof items)[number] & { product_id: string } =>
      i.product_id !== null
  );
  if (stockItems.length === 0) {
    return;
  }

  const productIds = [...new Set(stockItems.map((i) => i.product_id))];

  const variantIds = stockItems
    .map((i) => i.product_variant_id)
    .filter((id): id is string => Boolean(id));

  const { variantLotMap, lotsByProduct } = await fetchLotsForRestore(
    supabase,
    orgId,
    productIds,
    variantIds
  );

  const { lotUpdates, movementPayloads } = buildRestoreLotUpdates(stockItems, {
    variantLotMap,
    lotsByProduct,
    orgId,
    movementReason,
  });

  if (lotUpdates.length === 0) {
    return;
  }

  const { error: lotError } = await supabase
    .from("product_lots")
    .upsert(lotUpdates);

  if (lotError) {
    throw new Error(`Error al restaurar stock: ${lotError.message}`);
  }

  const { error: movementError } = await supabase
    .from("stock_movements")
    .insert(movementPayloads);

  if (movementError) {
    throw new Error(
      `Error al registrar restauración de stock: ${movementError.message}`
    );
  }
}

async function cleanupSourceOrderIfEmpty(
  supabase: SupabaseClient<Database>,
  sourceChildOrderId: string,
  childOrderNumber: string,
  userId: string
): Promise<void> {
  const { data: sourceOrder } = await supabase
    .from("orders")
    .select("status")
    .eq("id", sourceChildOrderId)
    .single();

  const { count: remaining } = await supabase
    .from("quote_items")
    .select("id", { count: "exact", head: true })
    .eq("assigned_order_id", sourceChildOrderId);

  if (remaining !== 0) {
    return;
  }

  await supabase
    .from("orders")
    .update({ status: "CANCELLED" })
    .eq("id", sourceChildOrderId);

  await supabase.from("order_status_history").insert({
    order_id: sourceChildOrderId,
    from_status: sourceOrder?.status ?? "GOODS_RECEIVED",
    to_status: "CANCELLED",
    notes: `Items reasignados al nuevo sub-pedido ${childOrderNumber}`,
    changed_by: userId,
    changed_at: new Date().toISOString(),
  });
}

export async function groupQuoteItemsBySupplier(
  quoteItemIds: string[]
): Promise<Map<string, string[]>> {
  const supabase = await createClient();

  const { data: items } = await supabase
    .from("quote_items")
    .select("id, product_id")
    .in("id", quoteItemIds);

  if (!items?.length) {
    return new Map();
  }

  const productIds = [
    ...new Set(
      items
        .map((i) => i.product_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    ),
  ];

  const { data: products } = await supabase
    .from("products")
    .select("id, supplier_id")
    .in("id", productIds);

  const productSupplier = new Map<string, string>();
  for (const p of products ?? []) {
    if (p.supplier_id) {
      productSupplier.set(p.id, p.supplier_id);
    }
  }

  const groups = new Map<string, string[]>();
  for (const item of items) {
    const supplierId = item.product_id
      ? (productSupplier.get(item.product_id) ?? "__none__")
      : "__none__";
    if (!groups.has(supplierId)) {
      groups.set(supplierId, []);
    }
    groups.get(supplierId)?.push(item.id);
  }

  return groups;
}

async function updateOriginalItemQuantity(
  supabase: SupabaseClient<Database>,
  itemId: string,
  remainingQty: number
): Promise<void> {
  const { error } = await supabase
    .from("quote_items")
    .update({ quantity: remainingQty })
    .eq("id", itemId);
  if (error) {
    throw new Error(`Error al actualizar cantidad original: ${error.message}`);
  }
}

async function insertSplitQuoteItem(
  supabase: SupabaseClient<Database>,
  item: {
    quote_id: string | null;
    description: string | null;
    unit_price: number;
    discount_amount: number | null;
    discount_percentage: number | null;
    product_id: string | null;
    product_variant_id: string | null;
    id: string;
  },
  assignedQty: number,
  quoteId: string
): Promise<string> {
  const assignedSubtotal = truncateMoney(item.unit_price * assignedQty);
  const { data, error } = await supabase
    .from("quote_items")
    .insert({
      quote_id: item.quote_id ?? quoteId,
      description: item.description,
      quantity: assignedQty,
      unit_price: item.unit_price,
      subtotal: assignedSubtotal,
      discount_amount: item.discount_amount,
      discount_percentage: item.discount_percentage,
      product_id: item.product_id,
      product_variant_id: item.product_variant_id,
      parent_quote_item_id: item.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(
      `Error al crear item dividido: ${error?.message ?? "No data"}`
    );
  }
  return data.id;
}

async function processItemSplits(
  supabase: SupabaseClient<Database>,
  quoteItemIds: string[],
  quantities: Record<string, number> | undefined,
  quoteId: string
): Promise<{
  newIds: string[];
  idMap: Map<string, string>;
  originalSplitIds: string[];
}> {
  if (!quantities) {
    return { newIds: [], idMap: new Map(), originalSplitIds: [] };
  }

  const splitIds = quoteItemIds.filter((id) => {
    const qty = quantities[id];
    return qty !== undefined && qty > 0;
  });

  if (splitIds.length === 0) {
    return { newIds: [], idMap: new Map(), originalSplitIds: [] };
  }

  const { data: originalItems, error } = await supabase
    .from("quote_items")
    .select(
      "id, quote_id, description, quantity, unit_price, subtotal, discount_amount, discount_percentage, product_id, product_variant_id"
    )
    .in("id", splitIds);

  if (error || !originalItems) {
    throw new Error(
      `Error al consultar items para split: ${error?.message ?? "No data"}`
    );
  }

  const newIds: string[] = [];
  const idMap = new Map<string, string>();
  const fullyAssignedIds: string[] = [];

  for (const item of originalItems) {
    const assignedQty = quantities[item.id];
    if (assignedQty === undefined || assignedQty <= 0) {
      continue;
    }

    const remainingQty = item.quantity - assignedQty;
    if (remainingQty < 0) {
      throw new Error(
        `La cantidad asignada (${assignedQty}) excede la cantidad disponible (${item.quantity}) para ${item.description || item.id}`
      );
    }

    if (remainingQty === 0) {
      fullyAssignedIds.push(item.id);
      continue;
    }

    await updateOriginalItemQuantity(supabase, item.id, remainingQty);
    const newRowId = await insertSplitQuoteItem(
      supabase,
      item,
      assignedQty,
      quoteId
    );
    newIds.push(newRowId);
    idMap.set(newRowId, item.id);
  }

  return {
    newIds,
    idMap,
    originalSplitIds: splitIds.filter((id) => !fullyAssignedIds.includes(id)),
  };
}

async function rollbackItemSplits(
  supabase: SupabaseClient<Database>,
  splitData: {
    newIds: string[];
    idMap: Map<string, string>;
  }
): Promise<void> {
  const { newIds } = splitData;
  if (newIds.length === 0) {
    return;
  }

  const { data: splitItems } = await supabase
    .from("quote_items")
    .select("id, quantity, parent_quote_item_id")
    .in("id", newIds);

  if (!splitItems || splitItems.length === 0) {
    return;
  }

  const validItems = splitItems.filter(
    (i): i is typeof i & { parent_quote_item_id: string } =>
      i.parent_quote_item_id != null
  );
  if (validItems.length === 0) {
    return;
  }

  const parentIds = [...new Set(validItems.map((i) => i.parent_quote_item_id))];
  const deleteIds = validItems.map((i) => i.id);

  const { data: parents } = await supabase
    .from("quote_items")
    .select("id, quantity")
    .in("id", parentIds);

  const parentQtyMap = new Map(parents?.map((p) => [p.id, p.quantity]) ?? []);

  const parentAdditions = new Map<string, number>();
  for (const item of validItems) {
    parentAdditions.set(
      item.parent_quote_item_id,
      (parentAdditions.get(item.parent_quote_item_id) ?? 0) + item.quantity
    );
  }

  await Promise.all(
    [...parentAdditions].map(([parentId, addQty]) => {
      const currentQty = parentQtyMap.get(parentId) ?? 0;
      return supabase
        .from("quote_items")
        .update({ quantity: currentQty + addQty })
        .eq("id", parentId);
    })
  );

  await supabase.from("quote_items").delete().in("id", deleteIds);
}

function computeEffectiveIdsAndQuantities(params: {
  quoteItemIds: string[];
  splitItemIds: string[];
  originalSplitIds: string[];
  splitIdToOriginal: Map<string, string>;
  quantities: Record<string, number> | undefined;
}): {
  effectiveIds: string[];
  effectiveQuantities: Record<string, number> | undefined;
} {
  const {
    quoteItemIds,
    splitItemIds,
    originalSplitIds,
    splitIdToOriginal,
    quantities,
  } = params;
  if (splitItemIds.length === 0) {
    return { effectiveIds: quoteItemIds, effectiveQuantities: quantities };
  }

  const effectiveIds = [
    ...quoteItemIds.filter((id) => !originalSplitIds.includes(id)),
    ...splitItemIds,
  ];

  const effectiveQuantities = quantities
    ? splitItemIds.reduce(
        (acc, id) => {
          const originalId = splitIdToOriginal.get(id);
          if (originalId && quantities[originalId]) {
            acc[id] = quantities[originalId];
          }
          return acc;
        },
        {} as Record<string, number>
      )
    : undefined;

  return { effectiveIds, effectiveQuantities };
}

export async function createChildOrder(params: {
  orgSlug: string;
  parentOrderId: string;
  quoteItemIds: string[];
  route: ChildOrderRoute;
  sourceChildOrderId?: string;
  observations?: string | null;
  skipParentRecalc?: boolean;
  quantities?: Record<string, number>;
}): Promise<{ childOrderId: string; childOrderNumber: string }> {
  const {
    orgSlug,
    parentOrderId,
    quoteItemIds,
    route,
    sourceChildOrderId,
    observations,
    quantities,
  } = params;
  const supabase = await createClient();

  const { orgId, parentOrder, userId } = await getValidatedSetup(
    supabase,
    orgSlug,
    parentOrderId
  );

  await validateItemAssignment(supabase, quoteItemIds, sourceChildOrderId);

  const splitResult = await processItemSplits(
    supabase,
    quoteItemIds,
    quantities,
    parentOrder.quote_id
  );
  const {
    newIds: splitItemIds,
    idMap: splitIdToOriginal,
    originalSplitIds,
  } = splitResult;
  const hasSplits = splitResult.newIds.length > 0;

  let deductionLotUpdates: StockLotUpdate[] = [];

  try {
    const { effectiveIds: effectiveQuoteItemIds, effectiveQuantities } =
      computeEffectiveIdsAndQuantities({
        quoteItemIds,
        splitItemIds,
        originalSplitIds,
        splitIdToOriginal,
        quantities,
      });

    await validateStockForItems({
      supabase,
      orgId,
      quoteItemIds: effectiveQuoteItemIds,
      route,
      quantities: effectiveQuantities,
    });

    const childOrderNumber = `${parentOrder.order_number}-${generateId(undefined, { length: 4 })}`;
    const initialStatus = ROUTE_INITIAL_STATUS[route];

    deductionLotUpdates = await maybeDeductStock({
      supabase,
      orgId,
      route,
      childOrderNumber,
      quoteItemIds: effectiveQuoteItemIds,
      quantities: effectiveQuantities,
    });

    const { data: childOrder, error: createError } = await supabase
      .from("orders")
      .insert({
        organization_id: orgId,
        parent_order_id: parentOrderId,
        quote_id: parentOrder.quote_id,
        order_number: childOrderNumber,
        status: initialStatus,
        created_by: userId,
        observations: observations ?? null,
      })
      .select("id")
      .single();

    if (createError || !childOrder) {
      throw new Error(
        `Error al crear el pedido hijo: ${createError?.message ?? "Error desconocido"}`
      );
    }

    await cleanupSourceOrders({
      supabase,
      sourceChildOrderId,
      childOrderNumber,
      userId,
      childOrder,
      quoteItemIds: effectiveQuoteItemIds,
    });

    await handlePostChildCreation({
      supabase,
      childOrderId: childOrder.id,
      route,
      initialStatus,
      parentOrderNumber: parentOrder.order_number,
      userId,
      parentOrderId,
      orgId,
      parentQuoteId: parentOrder.quote_id,
      quoteItemIds: effectiveQuoteItemIds,
      skipParentRecalc: params.skipParentRecalc,
    });

    return { childOrderId: childOrder.id, childOrderNumber };
  } catch (error) {
    if (deductionLotUpdates.length > 0) {
      await rollbackStockDeduction(supabase, orgId, deductionLotUpdates);
    }
    if (hasSplits) {
      await rollbackItemSplits(supabase, splitResult);
    }
    throw error;
  }
}

async function cleanupSourceOrders(params: {
  supabase: SupabaseClient<Database>;
  sourceChildOrderId?: string;
  childOrderNumber: string;
  userId: string;
  childOrder: { id: string };
  quoteItemIds: string[];
}): Promise<void> {
  const {
    supabase,
    sourceChildOrderId,
    childOrderNumber,
    userId,
    childOrder,
    quoteItemIds,
  } = params;

  let sourceIdsToCleanup: string[] = [];
  if (!sourceChildOrderId) {
    const { data: prevAssignments } = await supabase
      .from("quote_items")
      .select("assigned_order_id")
      .in("id", quoteItemIds);

    sourceIdsToCleanup = [
      ...new Set(
        (prevAssignments ?? [])
          .map((i) => i.assigned_order_id)
          .filter((id): id is string => id !== null)
      ),
    ];
  }

  if (quoteItemIds.length > 0) {
    const updateError = await assignItemsToChild(
      supabase,
      childOrder.id,
      quoteItemIds
    );
    if (updateError) {
      throw new Error(`Error al asignar items al pedido hijo: ${updateError}`);
    }
  }

  if (sourceChildOrderId) {
    await cleanupSourceOrderIfEmpty(
      supabase,
      sourceChildOrderId,
      childOrderNumber,
      userId
    );
  }

  for (const sourceId of sourceIdsToCleanup) {
    await cleanupSourceOrderIfEmpty(
      supabase,
      sourceId,
      childOrderNumber,
      userId
    );
  }
}

async function handlePostChildCreation(params: {
  supabase: SupabaseClient<Database>;
  childOrderId: string;
  route: ChildOrderRoute;
  initialStatus: OrderFlowStatus;
  parentOrderNumber: string;
  userId: string;
  parentOrderId: string;
  orgId: string;
  parentQuoteId: string;
  quoteItemIds: string[];
  skipParentRecalc?: boolean;
}): Promise<void> {
  const {
    supabase,
    childOrderId,
    route,
    initialStatus,
    parentOrderNumber,
    userId,
    parentOrderId,
    orgId,
    parentQuoteId,
    quoteItemIds,
    skipParentRecalc,
  } = params;

  await recordOrderHistory({
    supabase,
    childOrderId,
    route,
    initialStatus,
    parentOrderNumber,
    userId,
  });

  if (route === "production") {
    await copyDesignFromQuoteToOrder(
      supabase,
      parentQuoteId,
      childOrderId,
      userId
    );
  }

  if (route === "purchase") {
    await createDraftPurchaseFromChildOrder({
      orgId,
      orderId: childOrderId,
      quoteItemIds,
    });
  }

  if (!skipParentRecalc) {
    await recalcParentOrderStatus(parentOrderId, orgId);
  }
}

type StockDeductionParams = {
  supabase: SupabaseClient<Database>;
  orgId: string;
  route: ChildOrderRoute;
  childOrderNumber: string;
  quoteItemIds: string[];
  quantities?: Record<string, number>;
};

async function maybeDeductStock(
  params: StockDeductionParams
): Promise<StockLotUpdate[]> {
  if (params.route !== "direct" && params.route !== "production") {
    return [];
  }

  const routeLabel = params.route === "direct" ? "Despacho" : "Producción";
  const reason = `Pedido ${params.childOrderNumber} - ${routeLabel}`;
  const deduction = await deductStockForOrderItems({
    supabase: params.supabase,
    orgId: params.orgId,
    quoteItemIds: params.quoteItemIds,
    movementReason: reason,
    quantities: params.quantities,
  });
  return deduction.lotUpdates;
}

async function assignItemsToChild(
  supabase: SupabaseClient<Database>,
  childOrderId: string,
  quoteItemIds: string[]
): Promise<string | null> {
  const { error } = await supabase
    .from("quote_items")
    .update({ assigned_order_id: childOrderId })
    .in("id", quoteItemIds);

  return error?.message ?? null;
}

type OrderHistoryParams = {
  supabase: SupabaseClient<Database>;
  childOrderId: string;
  route: ChildOrderRoute;
  initialStatus: OrderFlowStatus;
  parentOrderNumber: string;
  userId: string;
};

async function recordOrderHistory(params: OrderHistoryParams): Promise<void> {
  const fromStatus = params.route === "purchase" ? undefined : "PENDING_STOCK";

  const { error: historyError } = await params.supabase
    .from("order_status_history")
    .insert({
      order_id: params.childOrderId,
      from_status: fromStatus,
      to_status: params.initialStatus,
      notes: `Sub-Pedido creado desde ${params.parentOrderNumber} - Ruta: ${params.route}`,
      changed_by: params.userId,
      changed_at: new Date().toISOString(),
    });

  if (historyError) {
    throw new Error(`Error al registrar historial: ${historyError.message}`);
  }
}

export async function dispatchChildOrder(params: {
  orgId: string;
  childOrderId: string;
  parentOrderId: string;
  remitoNumber: string;
  notes?: string;
  userId: string;
}): Promise<void> {
  const supabase = await createClient();

  const { error: eventError } = await supabase
    .from("order_dispatch_events")
    .insert({
      order_id: params.childOrderId,
      remito_number: params.remitoNumber,
      dispatched_at: new Date().toISOString(),
      notes: params.notes ?? null,
    });

  if (eventError) {
    throw new Error(
      `Error al registrar evento de despacho: ${eventError.message}`
    );
  }

  const { data: currentOrder } = await supabase
    .from("orders")
    .select("status")
    .eq("id", params.childOrderId)
    .eq("organization_id", params.orgId)
    .single();

  const fromStatus = currentOrder?.status ?? "PREPARING";

  const { error: historyError } = await supabase
    .from("order_status_history")
    .insert({
      order_id: params.childOrderId,
      from_status: fromStatus,
      to_status: "DISPATCHED",
      notes: `Despachado - Remito ${params.remitoNumber}${params.notes ? ` - ${params.notes}` : ""}`,
      changed_by: params.userId,
      changed_at: new Date().toISOString(),
    });

  if (historyError) {
    throw new Error(
      `Error al registrar historial de despacho: ${historyError.message}`
    );
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update({ status: "DISPATCHED", updated_at: new Date().toISOString() })
    .eq("id", params.childOrderId)
    .eq("organization_id", params.orgId);

  if (updateError) {
    throw new Error(
      `Error al actualizar estado del pedido: ${updateError.message}`
    );
  }

  await recalcParentOrderStatus(params.parentOrderId, params.orgId);
}

type OrderRevertInfo = {
  canRevert: boolean;
  previousStatus: OrderFlowStatus | null;
  previousLabel: string | null;
  revertType: "normal" | "undo_creation" | "cascade_revert";
};

export type OrdersRevertInfoMap = Record<string, OrderRevertInfo>;

function buildOrderRevertInfo(
  orderId: string,
  orderMap: Map<
    string,
    {
      id: string;
      parent_order_id: string | null;
      status: string;
      purchase_order_id: string | null;
    }
  >,
  parentsWithChildren: Set<string>,
  latestPerOrder: Map<string, string | null>
): OrderRevertInfo {
  const order = orderMap.get(orderId);

  if (!order) {
    return {
      canRevert: false,
      previousStatus: null,
      previousLabel: null,
      revertType: "normal",
    };
  }

  // Pedidos en mercadería recibida no se pueden revertir
  if (order.status === "GOODS_RECEIVED") {
    return {
      canRevert: false,
      previousStatus: null,
      previousLabel: null,
      revertType: "normal",
    };
  }

  // Children con compras cursadas no se pueden revertir
  if (
    order.parent_order_id !== null &&
    order.purchase_order_id !== null &&
    order.status === "PURCHASING"
  ) {
    return {
      canRevert: false,
      previousStatus: null,
      previousLabel: null,
      revertType: "normal",
    };
  }

  const isChild = order.parent_order_id !== null;

  // Children always revert via undo_creation
  if (isChild) {
    const config =
      ORDER_STATUS_CONFIG[order.status as keyof typeof ORDER_STATUS_CONFIG];
    return {
      canRevert: true,
      previousStatus: order.status as OrderFlowStatus,
      previousLabel: config?.label ?? order.status,
      revertType: "undo_creation",
    };
  }

  const isParentWithChildren = parentsWithChildren.has(orderId);

  const fromStatus = latestPerOrder.get(orderId) ?? null;

  if (!fromStatus) {
    return {
      canRevert: false,
      previousStatus: null,
      previousLabel: null,
      revertType: "normal",
    };
  }

  const config =
    ORDER_STATUS_CONFIG[fromStatus as keyof typeof ORDER_STATUS_CONFIG];

  return {
    canRevert: true,
    previousStatus: fromStatus as OrderFlowStatus,
    previousLabel: config?.label ?? fromStatus,
    revertType: isParentWithChildren ? "cascade_revert" : "normal",
  };
}

async function fetchParentsWithChildren(
  supabase: SupabaseClient<Database>,
  parentIds: string[],
  orgId: string
): Promise<Set<string>> {
  const parentsWithChildren = new Set<string>();
  if (parentIds.length === 0) {
    return parentsWithChildren;
  }

  const { data: children } = await supabase
    .from("orders")
    .select("parent_order_id")
    .in("parent_order_id", parentIds)
    .eq("organization_id", orgId);

  if (children) {
    for (const child of children) {
      if (child.parent_order_id) {
        parentsWithChildren.add(child.parent_order_id);
      }
    }
  }
  return parentsWithChildren;
}

async function fetchLatestHistoryPerOrder(
  supabase: SupabaseClient<Database>,
  orderIds: string[]
): Promise<Map<string, string | null>> {
  const latestPerOrder = new Map<string, string | null>();

  const { data: allHistory } = await supabase
    .from("order_status_history")
    .select("order_id, from_status, changed_at")
    .in("order_id", orderIds)
    .order("changed_at", { ascending: false });

  if (allHistory) {
    for (const entry of allHistory) {
      if (!latestPerOrder.has(entry.order_id)) {
        latestPerOrder.set(entry.order_id, entry.from_status);
      }
    }
  }
  return latestPerOrder;
}

export async function getOrdersRevertInfo(
  orgSlug: string,
  orderIds: string[]
): Promise<OrdersRevertInfoMap> {
  if (orderIds.length === 0) {
    return {};
  }

  const supabase = await createClient();
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return {};
  }

  const { data: orders } = await supabase
    .from("orders")
    .select("id, parent_order_id, status, purchase_order_id")
    .in("id", orderIds)
    .eq("organization_id", org.id);

  if (!orders) {
    return {};
  }

  const orderMap = new Map(
    orders.map((o) => [
      o.id,
      {
        id: o.id,
        parent_order_id: o.parent_order_id,
        status: o.status,
        purchase_order_id: o.purchase_order_id,
      },
    ])
  );

  const parentIds = orders
    .filter((o) => o.parent_order_id === null)
    .map((o) => o.id);

  const [parentsWithChildren, latestPerOrder] = await Promise.all([
    fetchParentsWithChildren(supabase, parentIds, org.id),
    fetchLatestHistoryPerOrder(supabase, orderIds),
  ]);

  const result: OrdersRevertInfoMap = {};

  for (const orderId of orderIds) {
    result[orderId] = buildOrderRevertInfo(
      orderId,
      orderMap,
      parentsWithChildren,
      latestPerOrder
    );
  }

  return result;
}

type CancelOrderResult = {
  success: boolean;
  error?: string;
};

function shouldRestoreStock(saleStatus: string | null): boolean {
  return (
    saleStatus === "CONFIRMED" ||
    saleStatus === "DISPATCH" ||
    saleStatus === "DELIVERED"
  );
}

async function recalculateSaleTotal(
  supabase: SupabaseClient<Database>,
  salesOrderId: string,
  orgId: string
): Promise<void> {
  const { data: items } = await supabase
    .from("sales_order_items")
    .select("subtotal")
    .eq("sales_order_id", salesOrderId)
    .eq("organization_id", orgId);

  const newTotal = truncateMoney(
    (items ?? []).reduce((sum, item) => sum + Number(item.subtotal ?? 0), 0)
  );

  const { error } = await supabase
    .from("sales_orders")
    .update({
      sub_total: newTotal,
      total_amount: newTotal,
      updated_at: new Date().toISOString(),
    })
    .eq("id", salesOrderId)
    .eq("organization_id", orgId);

  if (error) {
    throw new Error(`Error al recalcular total de venta: ${error.message}`);
  }
}

async function cancelLinkedPurchaseOrder(
  supabase: SupabaseClient<Database>,
  orderId: string,
  orgId: string
): Promise<void> {
  const { data: order } = await supabase
    .from("orders")
    .select("purchase_order_id")
    .eq("id", orderId)
    .single();

  if (order?.purchase_order_id) {
    await supabase
      .from("purchase_orders")
      .update({
        status: "CANCELLED",
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.purchase_order_id)
      .eq("organization_id", orgId);
  }
}

async function getSaleStatusForOrderParent(
  supabase: SupabaseClient<Database>,
  parentOrderId: string,
  orgId: string
): Promise<string | null> {
  const { data: parent } = await supabase
    .from("orders")
    .select("sales_order_id")
    .eq("id", parentOrderId)
    .eq("organization_id", orgId)
    .single();

  if (!parent?.sales_order_id) {
    return null;
  }

  const { data: sale } = await supabase
    .from("sales_orders")
    .select("status")
    .eq("id", parent.sales_order_id)
    .single();

  return sale?.status ?? null;
}

async function deleteSalesOrderItemsForQuoteItems(
  supabase: SupabaseClient<Database>,
  salesOrderId: string,
  quoteItemIds: string[]
): Promise<void> {
  await supabase
    .from("sales_order_items")
    .delete()
    .in("quote_item_id", quoteItemIds)
    .eq("sales_order_id", salesOrderId);
}

const NON_CANCELLABLE_STATUSES: OrderFlowStatus[] = ["DISPATCHED", "DELIVERED"];

async function cancelChildOrder(
  supabase: SupabaseClient<Database>,
  params: {
    orderId: string;
    orgId: string;
    userId: string;
    notes: string;
    currentStatus: OrderFlowStatus;
    parentOrderId: string;
  }
): Promise<CancelOrderResult> {
  const { orderId, orgId, userId, currentStatus, parentOrderId } = params;
  const notes = params.notes.trim();

  if (NON_CANCELLABLE_STATUSES.includes(currentStatus)) {
    return {
      success: false,
      error: "No se puede cancelar un sub-pedido que ya fue despachado.",
    };
  }

  // 1. Cancel the order
  const { error: cancelError } = await supabase
    .from("orders")
    .update({
      status: "CANCELLED",
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("organization_id", orgId);

  if (cancelError) {
    return {
      success: false,
      error: `Error al cancelar sub-pedido: ${cancelError.message}`,
    };
  }

  // 2. Cancel linked purchase order if any
  await cancelLinkedPurchaseOrder(supabase, orderId, orgId);

  // 3. Record history
  const { error: histError } = await supabase
    .from("order_status_history")
    .insert({
      order_id: orderId,
      from_status: currentStatus,
      to_status: "CANCELLED",
      notes,
      changed_by: userId,
      changed_at: new Date().toISOString(),
    });

  if (histError) {
    return {
      success: false,
      error: `Error al registrar historial: ${histError.message}`,
    };
  }

  // 4. Restore stock if sale was confirmed
  const saleStatus = await getSaleStatusForOrderParent(
    supabase,
    parentOrderId,
    orgId
  );

  if (shouldRestoreStock(saleStatus)) {
    const { data: order } = await supabase
      .from("orders")
      .select("quote_id")
      .eq("id", orderId)
      .single();

    if (order?.quote_id) {
      const { data: items } = await supabase
        .from("quote_items")
        .select("id")
        .eq("quote_id", order.quote_id)
        .eq("assigned_order_id", orderId);

      const itemIds = (items ?? []).map((i) => i.id);
      if (itemIds.length > 0) {
        await restoreStockForOrderItems(
          supabase,
          orgId,
          itemIds,
          `Cancelación de sub-pedido ${orderId}`
        );
      }
    }
  }

  // 5. Delete corresponding sales_order_items
  // (items remain assigned to child for traceability but removed from sale)
  const { data: parent } = await supabase
    .from("orders")
    .select("sales_order_id")
    .eq("id", parentOrderId)
    .single();

  if (parent?.sales_order_id) {
    const { data: childItems } = await supabase
      .from("quote_items")
      .select("id")
      .eq("assigned_order_id", orderId);

    const childItemIds = (childItems ?? []).map((i) => i.id);
    if (childItemIds.length > 0) {
      await deleteSalesOrderItemsForQuoteItems(
        supabase,
        parent.sales_order_id,
        childItemIds
      );
    }

    await recalculateSaleTotal(supabase, parent.sales_order_id, orgId);
  }

  // 6. Recalculate parent status
  await recalcParentOrderStatus(parentOrderId, orgId);

  return { success: true };
}

async function cancelSingleOrder(
  supabase: SupabaseClient<Database>,
  params: {
    orderId: string;
    orgId: string;
    userId: string;
    notes: string;
    currentStatus: OrderFlowStatus;
    salesOrderId: string | null;
  }
): Promise<CancelOrderResult> {
  const { orderId, orgId, userId, currentStatus, salesOrderId } = params;
  const notes = params.notes.trim();

  // 1. Cancel the order
  const { error: cancelError } = await supabase
    .from("orders")
    .update({
      status: "CANCELLED",
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("organization_id", orgId);

  if (cancelError) {
    return {
      success: false,
      error: `Error al cancelar pedido: ${cancelError.message}`,
    };
  }

  // 2. Cancel linked purchase order if any
  await cancelLinkedPurchaseOrder(supabase, orderId, orgId);

  // 3. Record history
  const { error: histError } = await supabase
    .from("order_status_history")
    .insert({
      order_id: orderId,
      from_status: currentStatus,
      to_status: "CANCELLED",
      notes,
      changed_by: userId,
      changed_at: new Date().toISOString(),
    });

  if (histError) {
    return {
      success: false,
      error: `Error al registrar historial: ${histError.message}`,
    };
  }

  // 4. Restore stock if sale was confirmed
  if (salesOrderId) {
    const { data: sale } = await supabase
      .from("sales_orders")
      .select("status")
      .eq("id", salesOrderId)
      .single();

    if (shouldRestoreStock(sale?.status ?? null)) {
      const { data: order } = await supabase
        .from("orders")
        .select("quote_id")
        .eq("id", orderId)
        .single();

      if (order?.quote_id) {
        const { data: items } = await supabase
          .from("quote_items")
          .select("id")
          .eq("quote_id", order.quote_id)
          .is("assigned_order_id", null);

        const unassignedIds = (items ?? []).map((i) => i.id);
        if (unassignedIds.length > 0) {
          await restoreStockForOrderItems(
            supabase,
            orgId,
            unassignedIds,
            `Cancelación de pedido ${orderId}`
          );
        }
      }
    }

    // 5. Delete remaining sales_order_items
    await supabase
      .from("sales_order_items")
      .delete()
      .eq("sales_order_id", salesOrderId);

    await recalculateSaleTotal(supabase, salesOrderId, orgId);
  }

  // 6. Sync linked sale to CANCELLED
  if (salesOrderId) {
    await syncSaleStatus(supabase, salesOrderId, orgId, "CANCELLED");
  }

  return { success: true };
}

async function cancelActiveChildren(
  supabase: SupabaseClient<Database>,
  params: {
    children: Array<{ id: string; status: string }>;
    orgId: string;
    userId: string;
    parentOrderId: string;
  }
): Promise<string | null> {
  const { children, orgId, userId, parentOrderId } = params;

  const activeChildren =
    children?.filter((c) => c.status !== "CANCELLED") ?? [];

  for (const child of activeChildren) {
    const result = await cancelChildOrder(supabase, {
      orderId: child.id,
      orgId,
      userId,
      notes: "Cancelación por pedido padre cancelado",
      currentStatus: child.status as OrderFlowStatus,
      parentOrderId,
    });
    if (!result.success) {
      return result.error ?? "Error al cancelar hijo";
    }
  }

  return null;
}

async function restoreAndCleanSaleItems(
  supabase: SupabaseClient<Database>,
  params: {
    orgId: string;
    orderId: string;
    salesOrderId: string;
  }
): Promise<string | null> {
  const { orgId, orderId, salesOrderId } = params;

  const { data: sale } = await supabase
    .from("sales_orders")
    .select("status")
    .eq("id", salesOrderId)
    .single();

  if (shouldRestoreStock(sale?.status ?? null)) {
    const { data: order } = await supabase
      .from("orders")
      .select("quote_id")
      .eq("id", orderId)
      .single();

    if (order?.quote_id) {
      const { data: items } = await supabase
        .from("quote_items")
        .select("id")
        .eq("quote_id", order.quote_id)
        .is("assigned_order_id", null);

      const unassignedIds = (items ?? []).map((i) => i.id);
      if (unassignedIds.length > 0) {
        await restoreStockForOrderItems(
          supabase,
          orgId,
          unassignedIds,
          `Cancelación de pedido ${orderId}`
        );
      }
    }
  }

  await supabase
    .from("sales_order_items")
    .delete()
    .eq("sales_order_id", salesOrderId);

  await recalculateSaleTotal(supabase, salesOrderId, orgId);

  return null;
}

async function cancelParentWithChildren(
  supabase: SupabaseClient<Database>,
  params: {
    orderId: string;
    orgId: string;
    userId: string;
    notes: string;
    currentStatus: OrderFlowStatus;
    salesOrderId: string | null;
  }
): Promise<CancelOrderResult> {
  const { orderId, orgId, userId, currentStatus, salesOrderId } = params;
  const notes = params.notes.trim();

  // 1. Get all active children
  const { data: children } = await supabase
    .from("orders")
    .select("id, status")
    .eq("parent_order_id", orderId)
    .eq("organization_id", orgId);

  // 2. Cancel each active child
  const childError = await cancelActiveChildren(supabase, {
    children: (children ?? []) as Array<{ id: string; status: string }>,
    orgId,
    userId,
    parentOrderId: orderId,
  });
  if (childError) {
    return { success: false, error: childError };
  }

  // 3. Restore stock and delete remaining sales order items
  if (salesOrderId) {
    const restoreError = await restoreAndCleanSaleItems(supabase, {
      orgId,
      orderId,
      salesOrderId,
    });
    if (restoreError) {
      return { success: false, error: restoreError };
    }
  }

  // 4. Set parent to CANCELLED
  const { error: cancelError } = await supabase
    .from("orders")
    .update({
      status: "CANCELLED",
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("organization_id", orgId);

  if (cancelError) {
    return {
      success: false,
      error: `Error al cancelar pedido padre: ${cancelError.message}`,
    };
  }

  // 5. Record history
  const { error: histError } = await supabase
    .from("order_status_history")
    .insert({
      order_id: orderId,
      from_status: currentStatus,
      to_status: "CANCELLED",
      notes,
      changed_by: userId,
      changed_at: new Date().toISOString(),
    });

  if (histError) {
    return {
      success: false,
      error: `Error al registrar historial: ${histError.message}`,
    };
  }

  // 6. Sync linked sale to CANCELLED
  if (salesOrderId) {
    await syncSaleStatus(supabase, salesOrderId, orgId, "CANCELLED");
  }

  return { success: true };
}

export async function cancelOrder(
  supabase: SupabaseClient<Database>,
  params: {
    orgId: string;
    userId: string;
    orderId: string;
    notes: string;
    currentStatus: OrderFlowStatus;
    parentOrderId: string | null;
    salesOrderId: string | null;
  }
): Promise<CancelOrderResult> {
  const { orderId, parentOrderId, currentStatus } = params;

  if (NON_CANCELLABLE_STATUSES.includes(currentStatus)) {
    return {
      success: false,
      error:
        "No se puede cancelar un pedido que ya fue despachado. Use la cancelación desde Ventas o genere una Nota de Crédito.",
    };
  }

  // Child order — cancel just this child
  if (parentOrderId) {
    return cancelChildOrder(supabase, {
      ...params,
      parentOrderId,
    });
  }

  // Check if parent has children
  const { count } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("parent_order_id", orderId)
    .eq("organization_id", params.orgId);

  // Parent with children — cancel all
  if (count && count > 0) {
    return cancelParentWithChildren(supabase, params);
  }

  // Standalone single order
  return cancelSingleOrder(supabase, params);
}

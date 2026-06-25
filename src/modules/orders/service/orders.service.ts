import type { SupabaseClient } from "@supabase/supabase-js";
import { generateId } from "@/lib/id";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { convertQuoteToSalesOrder } from "@/modules/quotes/service/quotes.service";
import { confirmIncompleteSaleWithStockDeduction } from "@/modules/sales/service/sales.service";
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
  type OrderStatusHistoryRowWithUser,
  type OrderWithChildren,
  type OrderWithDetails,
  type OrderWithHistory,
  type StockInfo,
} from "../types";

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
        customers!inner(
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
        customers!inner(
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
      children:orders!parent_order_id(
        id,
        order_number,
        status,
        created_at,
        created_by,
        parent_order_id
      )
    `
    )
    .eq("organization_id", org.id)
    .eq("status", "PENDING_STOCK")
    .is("parent_order_id", null)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Error al obtener pedidos padre: ${error.message}`);
  }

  return (data ?? []) as unknown as OrderWithChildren[];
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
        customers!inner(
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
        customers!inner(
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
    .select("id, order_number, status, created_at")
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
    await confirmIncompleteSaleWithStockDeduction(supabase, orgId, saleId);
    return;
  }

  const saleStatus = ORDER_TO_SALE_STATUS[newStatus];
  if (!saleStatus) {
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

  const previousStatus = parent?.status as OrderFlowStatus | undefined;
  const parentSaleId: string | null = parent?.sales_order_id ?? null;

  if (!parent) {
    return { salesOrderId: parentSaleId };
  }

  if (previousStatus === "PENDING_STOCK" && parent.quote_id) {
    const { count } = await supabase
      .from("quote_items")
      .select("id", { count: "exact", head: true })
      .eq("quote_id", parent.quote_id)
      .is("assigned_order_id", null);

    if (count && count > 0) {
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

  const newStatus = setPriority(
    CHILD_STATUS_PRIORITY,
    nonTerminalChildren,
    children
  );

  await updateParentOrderStatus(
    newStatus,
    parentOrderId,
    orgId,
    previousStatus
  );

  // Sincronizar venta vinculada al padre
  if (parentSaleId) {
    await syncSaleStatus(supabase, parentSaleId, orgId, newStatus);
  }

  return { salesOrderId: parentSaleId };
}

async function validateQuoteItemsForAssignment(
  supabase: SupabaseClient<Database>,
  quoteItemIds: string[]
): Promise<void> {
  const { data: existingItems, error: itemsError } = await supabase
    .from("quote_items")
    .select("id, assigned_order_id")
    .in("id", quoteItemIds);

  if (itemsError) {
    throw new Error(`Error al validar items: ${itemsError.message}`);
  }

  if (!existingItems || existingItems.length !== quoteItemIds.length) {
    throw new Error("Uno o más items del presupuesto no fueron encontrados");
  }

  const alreadyAssigned = existingItems.find(
    (item) => item.assigned_order_id !== null
  );
  if (alreadyAssigned) {
    throw new Error(
      `El item ${alreadyAssigned.id} ya está asignado a otro pedido hijo`
    );
  }
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

export async function createChildOrder(params: {
  orgSlug: string;
  parentOrderId: string;
  quoteItemIds: string[];
  route: ChildOrderRoute;
}): Promise<{ childOrderId: string; childOrderNumber: string }> {
  const { orgSlug, parentOrderId, quoteItemIds, route } = params;
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

  await validateQuoteItemsForAssignment(supabase, quoteItemIds);

  const childOrderNumber = `${parentOrder.order_number}-${generateId(undefined, { length: 4 })}`;

  const initialStatus = ROUTE_INITIAL_STATUS[route];

  const { data: childOrder, error: createError } = await supabase
    .from("orders")
    .insert({
      organization_id: org.id,
      parent_order_id: parentOrderId,
      quote_id: parentOrder.quote_id,
      order_number: childOrderNumber,
      status: initialStatus,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (createError || !childOrder) {
    throw new Error(
      `Error al crear el pedido hijo: ${createError?.message ?? "Error desconocido"}`
    );
  }

  const { error: updateItemsError } = await supabase
    .from("quote_items")
    .update({ assigned_order_id: childOrder.id })
    .in("id", quoteItemIds);

  if (updateItemsError) {
    throw new Error(
      `Error al asignar items al pedido hijo: ${updateItemsError.message}`
    );
  }

  const fromStatus = route === "purchase" ? undefined : "PENDING_STOCK";

  const { error: historyError } = await supabase
    .from("order_status_history")
    .insert({
      order_id: childOrder.id,
      from_status: fromStatus,
      to_status: initialStatus,
      notes: `Sub-Pedido creado desde ${parentOrder.order_number} - Ruta: ${route}`,
      changed_by: user.id,
      changed_at: new Date().toISOString(),
    });

  if (historyError) {
    throw new Error(`Error al registrar historial: ${historyError.message}`);
  }

  if (route === "production") {
    await copyDesignFromQuoteToOrder(
      supabase,
      parentOrder.quote_id,
      childOrder.id,
      user.id
    );
  }

  await recalcParentOrderStatus(parentOrderId, org.id);

  return {
    childOrderId: childOrder.id,
    childOrderNumber,
  };
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
  orderMap: Map<string, { id: string; parent_order_id: string | null }>,
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

  const isParentWithChildren =
    order.parent_order_id === null && parentsWithChildren.has(orderId);

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

  const isChild = order.parent_order_id !== null;
  const isUndoCreation = isChild && fromStatus === "PENDING_STOCK";

  let revertType: "normal" | "undo_creation" | "cascade_revert" = "normal";
  if (isUndoCreation) {
    revertType = "undo_creation";
  } else if (isParentWithChildren) {
    revertType = "cascade_revert";
  }

  return {
    canRevert: true,
    previousStatus: fromStatus as OrderFlowStatus,
    previousLabel: config?.label ?? fromStatus,
    revertType,
  };
}

async function fetchParentsWithChildren(
  supabase: Awaited<ReturnType<typeof createClient>>,
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
  supabase: Awaited<ReturnType<typeof createClient>>,
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
    .select("id, parent_order_id")
    .in("id", orderIds)
    .eq("organization_id", org.id);

  if (!orders) {
    return {};
  }

  const orderMap = new Map(orders.map((o) => [o.id, o]));

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

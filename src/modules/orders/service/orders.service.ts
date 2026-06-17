import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { convertQuoteToSalesOrder } from "@/modules/quotes/service/quotes.service";
import type {
  DispatchMetrics,
  OrderAreaCounts,
  OrderDesignProduct,
  OrderFlowStatus,
  OrderMetrics,
  OrderStatusHistoryRowWithUser,
  OrderWithDetails,
  OrderWithDispatch,
  OrderWithHistory,
  StockInfo,
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
          product_variant_id
        )
      )
    `
    )
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Error al obtener los pedidos: ${error.message}`);
  }

  return (data ?? []) as unknown as OrderWithDetails[];
}

export async function getOrdersForDispatch(
  orgSlug: string
): Promise<OrderWithDispatch[]> {
  const orders = await getOrdersByOrg(orgSlug);
  if (orders.length === 0) {
    return [];
  }

  const supabase = await createClient();
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return [];
  }

  const orderIds = orders.map((o) => o.id);

  const { data: historyEntries } = await supabase
    .from("order_status_history")
    .select("order_id, to_status, notes, changed_at")
    .in("order_id", orderIds)
    .in("to_status", ["DISPATCHED", "DELIVERED"])
    .order("changed_at", { ascending: true });

  const dispatchMap = new Map<
    string,
    {
      dispatch_notes: string | null;
      dispatched_at: string | null;
      delivered_at: string | null;
    }
  >();
  for (const order of orders) {
    dispatchMap.set(order.id, {
      dispatch_notes: null,
      dispatched_at: null,
      delivered_at: null,
    });
  }

  for (const entry of historyEntries ?? []) {
    const info = dispatchMap.get(entry.order_id);
    if (!info) {
      continue;
    }
    if (entry.to_status === "DISPATCHED" && !info.dispatched_at) {
      info.dispatched_at = entry.changed_at;
      info.dispatch_notes = entry.notes;
    }
    if (entry.to_status === "DELIVERED" && !info.delivered_at) {
      info.delivered_at = entry.changed_at;
    }
  }

  return orders.map((o) => {
    const info = dispatchMap.get(o.id);
    return {
      ...o,
      dispatch_notes: info?.dispatch_notes ?? null,
      dispatched_at: info?.dispatched_at ?? null,
      delivered_at: info?.delivered_at ?? null,
    };
  });
}

export async function getOrderById(
  orgSlug: string,
  orderId: string
): Promise<OrderWithHistory | null> {
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
          product_variant_id
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

  return order as unknown as OrderWithHistory;
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
    .select("status")
    .eq("organization_id", org.id)
    .not("status", "in", '("DELIVERED","CANCELLED","FINANCE_REJECTED")');

  if (error || !data) {
    return { finance: 0, stock: 0, production: 0, dispatch: 0, total: 0 };
  }

  const finance = data.filter((o) => o.status === "PENDING_FINANCE").length;
  const stock = data.filter((o) =>
    [
      "PENDING_STOCK",
      "STOCK_OK",
      "PURCHASE_REQUIRED",
      "PURCHASING",
      "GOODS_RECEIVED",
    ].includes(o.status)
  ).length;
  const production = data.filter((o) =>
    ["IN_PRODUCTION", "DESIGN_REVIEW"].includes(o.status)
  ).length;
  const dispatch = data.filter((o) =>
    ["PREPARING", "DISPATCHED"].includes(o.status)
  ).length;

  return {
    finance,
    stock,
    production,
    dispatch,
    total: data.length,
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
  orders: OrderWithDetails[]
): DispatchMetrics {
  return {
    preparing: orders.filter((o) => o.status === "PREPARING").length,
    inTransit: orders.filter((o) => o.status === "DISPATCHED").length,
    delivered: orders.filter((o) => o.status === "DELIVERED").length,
  };
}

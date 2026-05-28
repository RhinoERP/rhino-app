import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import {
  type OrderDesignRow,
  type OrderFlowStatus,
  type OrderWithDetails,
  type OrderWithHistory,
  VALID_TRANSITIONS,
} from "../types";

export async function getOrdersByOrg(
  orgSlug: string
): Promise<OrderWithDetails[]> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    return [];
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("orders")
    .select(`
      *,
      quotes (
        id,
        total_amount,
        currency,
        payment_condition,
        customers (
          business_name,
          fantasy_name
        ),
        quote_items (
          id,
          description,
          quantity,
          unit_price,
          subtotal,
          product_id
        )
      )
    `)
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Error al obtener pedidos: ${error.message}`);
  }
  return data ?? [];
}

export async function getOrderById(
  orgSlug: string,
  orderId: string
): Promise<OrderWithHistory | null> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    return null;
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("orders")
    .select(`
      *,
      quotes (
        id,
        total_amount,
        currency,
        payment_condition,
        customers (
          business_name,
          fantasy_name
        ),
        quote_items (
          id,
          description,
          quantity,
          unit_price,
          subtotal,
          product_id
        )
      ),
      order_status_history (
        id,
        from_status,
        to_status,
        notes,
        changed_by,
        changed_at
      ),
      order_designs (
        id,
        products,
        general_notes,
        client_approved_at,
        created_at,
        updated_at
      )
    `)
    .eq("id", orderId)
    .eq("organization_id", org.id)
    .order("changed_at", {
      referencedTable: "order_status_history",
      ascending: true,
    })
    .maybeSingle();

  if (error) {
    throw new Error(`Error al obtener el pedido: ${error.message}`);
  }
  return data ?? null;
}

export async function createOrderFromQuote(
  orgSlug: string,
  quoteId: string,
  userId: string
): Promise<string> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt++) {
    // Generar número de pedido: ORD-AÑO-XXXX
    const year = new Date().getFullYear();
    const { count } = await supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", org.id);

    const orderNumber = `ORD-${year}-${String((count ?? 0) + 1).padStart(4, "0")}`;

    const { data, error } = await supabase
      .from("orders")
      .insert({
        organization_id: org.id,
        quote_id: quoteId,
        order_number: orderNumber,
        status: "PENDING_FINANCE",
        created_by: userId,
      })
      .select("id")
      .single();

    if (error) {
      lastError = error;
      continue;
    }

    const { error: historyError } = await supabase
      .from("order_status_history")
      .insert({
        order_id: data.id,
        organization_id: org.id,
        from_status: null,
        to_status: "PENDING_FINANCE",
        notes: "Pedido creado desde presupuesto",
        changed_by: userId,
      });

    if (historyError) {
      console.error(
        "[OrderService] Error al registrar historial del pedido:",
        historyError
      );
    }

    return data.id;
  }

  throw new Error(
    `Error al crear el pedido: ${(lastError as { message?: string })?.message ?? "Error desconocido"}`
  );
}

// biome-ignore lint/nursery/useMaxParams: Service layer function requires these parameters for status updates
export async function updateOrderStatus(
  orgSlug: string,
  orderId: string,
  newStatus: OrderFlowStatus,
  notes: string | null,
  userId: string,
  extraFields?: Record<string, unknown>
): Promise<void> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data: current } = await supabase
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .eq("organization_id", org.id)
    .single();

  if (!current) {
    throw new Error("Pedido no encontrado");
  }

  const allowed = VALID_TRANSITIONS[current.status as OrderFlowStatus] ?? [];
  if (!allowed.includes(newStatus)) {
    throw new Error(`Transición inválida: ${current.status} → ${newStatus}`);
  }

  const ALLOWED_EXTRA_FIELDS = [
    "finance_notes",
    "finance_reviewed_by",
    "finance_reviewed_at",
    "stock_notes",
    "stock_checked_by",
    "stock_checked_at",
    "purchase_order_id",
    "production_notes",
    "production_started_at",
    "design_approved_at",
    "dispatch_notes",
    "tracking_number",
    "dispatched_at",
    "delivered_at",
  ] as const;

  const updateData: Record<string, unknown> = { status: newStatus };
  for (const key of ALLOWED_EXTRA_FIELDS) {
    if (key in (extraFields ?? {})) {
      updateData[key] = extraFields?.[key];
    }
  }

  const { data: updated, error } = await supabase
    .from("orders")
    .update(updateData)
    .eq("id", orderId)
    .eq("organization_id", org.id)
    .eq("status", current.status)
    .select("id")
    .single();

  if (error) {
    throw new Error(`Error al actualizar el pedido: ${error.message}`);
  }

  if (!updated) {
    throw new Error(
      "El pedido fue modificado por otro usuario. Refresca la página."
    );
  }

  const { error: historyError } = await supabase
    .from("order_status_history")
    .insert({
      order_id: orderId,
      organization_id: org.id,
      from_status: current.status ?? null,
      to_status: newStatus,
      notes,
      changed_by: userId,
    });

  if (historyError) {
    console.error(
      "[OrderService] Error al registrar historial del pedido:",
      historyError
    );
  }
}

export async function saveOrderDesign(
  orgId: string,
  orderId: string,
  designData: Omit<
    OrderDesignRow,
    "id" | "order_id" | "created_at" | "updated_at"
  >,
  userId: string
): Promise<void> {
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!order) {
    throw new Error("Pedido no encontrado");
  }

  const { error } = await supabase
    .from("order_designs")
    .upsert(
      { order_id: orderId, ...designData, created_by: userId },
      { onConflict: "order_id" }
    );

  if (error) {
    throw new Error(`Error al guardar el boceto: ${error.message}`);
  }
}

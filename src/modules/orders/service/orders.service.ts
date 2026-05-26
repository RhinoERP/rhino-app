import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type {
  OrderDesignRow,
  OrderFlowStatus,
  OrderWithDetails,
  OrderWithHistory,
} from "../types";

// El cliente de Supabase no tiene los tipos de las nuevas tablas generados,
// por eso usamos `any` solo para las queries de las tablas nuevas.
// biome-ignore lint/suspicious/noExplicitAny: Supabase types not generated for new orders tables
type AnyClient = any;

export async function getOrdersByOrg(
  orgSlug: string
): Promise<OrderWithDetails[]> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    return [];
  }

  const supabase = (await createClient()) as AnyClient;

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

  const supabase = (await createClient()) as AnyClient;

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

  const supabase = (await createClient()) as AnyClient;

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
    throw new Error(`Error al crear el pedido: ${error.message}`);
  }

  // Registrar en historial
  await supabase.from("order_status_history").insert({
    order_id: data.id,
    from_status: null,
    to_status: "PENDING_FINANCE",
    notes: "Pedido creado desde presupuesto",
    changed_by: userId,
  });

  return data.id;
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

  const supabase = (await createClient()) as AnyClient;

  // Obtener estado actual para el historial
  const { data: current } = await supabase
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .eq("organization_id", org.id)
    .single();

  const updateData: Record<string, unknown> = {
    status: newStatus,
    ...extraFields,
  };

  const { error } = await supabase
    .from("orders")
    .update(updateData)
    .eq("id", orderId)
    .eq("organization_id", org.id);

  if (error) {
    throw new Error(`Error al actualizar el pedido: ${error.message}`);
  }

  // Registrar en historial
  await supabase.from("order_status_history").insert({
    order_id: orderId,
    from_status: current?.status ?? null,
    to_status: newStatus,
    notes,
    changed_by: userId,
  });
}

export async function saveOrderDesign(
  orderId: string,
  designData: Omit<
    OrderDesignRow,
    "id" | "order_id" | "created_at" | "updated_at"
  >,
  userId: string
): Promise<void> {
  const supabase = (await createClient()) as AnyClient;

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

"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { Database } from "@/types/supabase";
import { createOrderAndSaleFromQuote } from "../service/orders.service";

export type CreateOrderResult = {
  success: boolean;
  orderId?: string;
  orderNumber?: string;
  error?: string;
};

export type CreateOrderAndSaleResult = CreateOrderResult & {
  salesOrderId?: string;
};

async function createOrder(
  supabase: SupabaseClient<Database>,
  orgId: string,
  quoteId: string,
  userId: string
): Promise<{ orderId: string; orderNumber: string }> {
  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select("id, status, organization_id")
    .eq("id", quoteId)
    .single();

  if (quoteError || !quote) {
    throw new Error("Presupuesto no encontrado");
  }

  if (quote.status !== "APPROVED") {
    throw new Error(
      "El presupuesto debe estar aprobado para convertirlo en pedido"
    );
  }

  if (quote.organization_id !== orgId) {
    throw new Error("El presupuesto no pertenece a esta organización");
  }

  const year = new Date().getFullYear();
  const { count, error: countError } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .gte("created_at", `${year}-01-01T00:00:00Z`);

  if (countError) {
    throw new Error(`Error al generar número de pedido: ${countError.message}`);
  }

  const sequence = String((count ?? 0) + 1).padStart(4, "0");
  const orderNumber = `ORD-${year}-${sequence}`;

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      organization_id: orgId,
      quote_id: quoteId,
      order_number: orderNumber,
      status: "PENDING_FINANCE",
      created_by: userId,
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
      changed_by: userId,
      changed_at: new Date().toISOString(),
    });

  if (historyError) {
    throw new Error(`Error al registrar historial: ${historyError.message}`);
  }

  const { error: quoteUpdateError } = await supabase
    .from("quotes")
    .update({
      status: "CONVERTED",
      updated_at: new Date().toISOString(),
    })
    .eq("id", quoteId);

  if (quoteUpdateError) {
    throw new Error(
      `Error al actualizar presupuesto: ${quoteUpdateError.message}`
    );
  }

  return { orderId: order.id, orderNumber };
}

export async function createOrderFromQuoteAction(
  orgSlug: string,
  quoteId: string
): Promise<CreateOrderResult> {
  try {
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

    const result = await createOrder(supabase, org.id, quoteId, user.id);

    revalidatePath(`/org/${orgSlug}/pedidos`);

    return {
      success: true,
      orderId: result.orderId,
      orderNumber: result.orderNumber,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error desconocido";
    return { success: false, error: message };
  }
}

export async function createOrderAndSaleFromQuoteAction(
  orgSlug: string,
  quoteId: string
): Promise<CreateOrderAndSaleResult> {
  try {
    const result = await createOrderAndSaleFromQuote(orgSlug, quoteId);

    revalidatePath(`/org/${orgSlug}/pedidos`);

    return {
      success: true,
      orderId: result.orderId,
      orderNumber: result.orderNumber,
      salesOrderId: result.salesOrderId,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error desconocido";
    return { success: false, error: message };
  }
}

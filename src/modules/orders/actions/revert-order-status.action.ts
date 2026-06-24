"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { recalcParentOrderStatus } from "../service/orders.service";
import { ORDER_STATUS_CONFIG, type OrderFlowStatus } from "../types";

export type RevertOrderStatusResult = {
  success: boolean;
  previousStatusLabel?: string;
  error?: string;
};

async function validateAndFetchOrder(
  orgSlug: string,
  orderId: string,
  notes: string
) {
  if (!notes.trim()) {
    return { error: "La observación es obligatoria" } as const;
  }

  const supabase = await createClient();
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return { error: "Organización no encontrada" } as const;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "No autorizado" } as const;
  }

  const { data: currentOrder, error: fetchError } = await supabase
    .from("orders")
    .select("id, status, parent_order_id")
    .eq("id", orderId)
    .eq("organization_id", org.id)
    .single();

  if (fetchError || !currentOrder) {
    return { error: "Pedido no encontrado" } as const;
  }

  return { supabase, org, user, currentOrder };
}

async function undoChildCreation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: {
    orderId: string;
    orgId: string;
    userId: string;
    orgSlug: string;
    parentOrderId: string | null;
    currentStatus: OrderFlowStatus;
  }
): Promise<RevertOrderStatusResult> {
  const { orderId, orgId, userId, orgSlug, parentOrderId, currentStatus } =
    params;

  const { error: unassignError } = await supabase
    .from("quote_items")
    .update({ assigned_order_id: null })
    .eq("assigned_order_id", orderId);

  if (unassignError) {
    return {
      success: false,
      error: `Error al liberar items: ${unassignError.message}`,
    };
  }

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

  const { error: insertError } = await supabase
    .from("order_status_history")
    .insert({
      order_id: orderId,
      from_status: currentStatus,
      to_status: "CANCELLED",
      notes: "Sub-pedido cancelado - items devueltos al pool de stock",
      changed_by: userId,
      changed_at: new Date().toISOString(),
    });

  if (insertError) {
    return {
      success: false,
      error: `Error al registrar historial: ${insertError.message}`,
    };
  }

  if (parentOrderId) {
    await recalcParentOrderStatus(parentOrderId, orgId);
    revalidatePath(`/org/${orgSlug}/pedidos/${parentOrderId}`);
  }

  revalidateOrderPaths(orgSlug, orderId);

  return { success: true, previousStatusLabel: "Cancelado" };
}

function revalidateOrderPaths(orgSlug: string, orderId: string) {
  revalidatePath(`/org/${orgSlug}/pedidos`);
  revalidatePath(`/org/${orgSlug}/pedidos/${orderId}`);
  revalidatePath(`/org/${orgSlug}/produccion`);
  revalidatePath(`/org/${orgSlug}/despacho`);
  revalidatePath(`/org/${orgSlug}/finanzas/aprobacion-pedidos`);
  revalidatePath(`/org/${orgSlug}/compras/stock-pedidos`);
}

async function checkNoChildren(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string,
  orgId: string
) {
  const { count } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("parent_order_id", orderId)
    .eq("organization_id", orgId);

  if (count && count > 0) {
    return { error: "No se puede revertir un pedido padre con hijos activos" };
  }
  return {};
}

export async function revertOrderStatusAction(
  orgSlug: string,
  orderId: string,
  notes: string,
  revertType: "normal" | "undo_creation" = "normal"
): Promise<RevertOrderStatusResult> {
  try {
    const validation = await validateAndFetchOrder(orgSlug, orderId, notes);
    if ("error" in validation) {
      return { success: false, error: validation.error };
    }

    const { supabase, org, user, currentOrder } = validation;
    const currentStatus = currentOrder.status as OrderFlowStatus;

    if (revertType === "undo_creation") {
      return await undoChildCreation(supabase, {
        orderId,
        orgId: org.id,
        userId: user.id,
        orgSlug,
        parentOrderId: currentOrder.parent_order_id,
        currentStatus,
      });
    }

    if (currentOrder.parent_order_id === null) {
      const childCheck = await checkNoChildren(supabase, orderId, org.id);
      if ("error" in childCheck) {
        return { success: false, error: childCheck.error };
      }
    }

    const { data: latestHistory, error: historyError } = await supabase
      .from("order_status_history")
      .select("from_status")
      .eq("order_id", orderId)
      .order("changed_at", { ascending: false })
      .limit(1)
      .single();

    if (historyError || !latestHistory?.from_status) {
      return {
        success: false,
        error: "El pedido no tiene un estado anterior al cual volver",
      };
    }

    const previousStatus = latestHistory.from_status;

    const { error: updateError } = await supabase
      .from("orders")
      .update({
        status: previousStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .eq("organization_id", org.id);

    if (updateError) {
      return {
        success: false,
        error: `Error al revertir: ${updateError.message}`,
      };
    }

    const { error: insertError } = await supabase
      .from("order_status_history")
      .insert({
        order_id: orderId,
        from_status: currentStatus,
        to_status: previousStatus,
        notes: notes.trim(),
        changed_by: user.id,
        changed_at: new Date().toISOString(),
      });

    if (insertError) {
      return {
        success: false,
        error: `Error al registrar historial: ${insertError.message}`,
      };
    }

    if (currentOrder.parent_order_id) {
      await recalcParentOrderStatus(currentOrder.parent_order_id, org.id);
      revalidatePath(`/org/${orgSlug}/pedidos/${currentOrder.parent_order_id}`);
    }

    revalidateOrderPaths(orgSlug, orderId);

    const config =
      ORDER_STATUS_CONFIG[previousStatus as keyof typeof ORDER_STATUS_CONFIG];

    return {
      success: true,
      previousStatusLabel: config?.label ?? previousStatus,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error desconocido al revertir";
    return { success: false, error: message };
  }
}

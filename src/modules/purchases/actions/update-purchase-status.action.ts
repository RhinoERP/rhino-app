"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { revertOrderStatusAction } from "@/modules/orders/actions/revert-order-status.action";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { updatePurchaseOrderStatus } from "../service/purchases.service";

async function revertLinkedOrder(orgSlug: string, purchaseOrderId: string) {
  const [supabase, org] = await Promise.all([
    createClient(),
    getOrganizationBySlug(orgSlug),
  ]);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const { data: linkedOrder, error } = await supabase
    .from("orders")
    .select("id, parent_order_id")
    .eq("organization_id", org.id)
    .eq("purchase_order_id", purchaseOrderId)
    .maybeSingle();

  if (error) {
    throw new Error(`Error al buscar el pedido vinculado: ${error.message}`);
  }
  if (!linkedOrder) {
    return false;
  }

  const result = await revertOrderStatusAction(
    orgSlug,
    linkedOrder.id,
    "Compra cancelada - mercadería devuelta a revisión de stock",
    linkedOrder.parent_order_id ? "undo_creation" : "normal"
  );
  if (!result.success) {
    throw new Error(result.error ?? "No se pudo liberar el pedido vinculado");
  }

  revalidatePath(`/org/${orgSlug}/pedidos`);
  revalidatePath(`/org/${orgSlug}/compras/stock-pedidos`);
  return true;
}

export async function updatePurchaseStatusAction(
  orgSlug: string,
  purchaseOrderId: string,
  status: "ORDERED" | "IN_TRANSIT" | "RECEIVED" | "CANCELLED",
  options?: {
    delivery_date?: string;
    logistics?: string;
  }
) {
  await ensure("purchases.manage", orgSlug);
  try {
    if (
      status === "CANCELLED" &&
      (await revertLinkedOrder(orgSlug, purchaseOrderId))
    ) {
      return { success: true };
    }

    const purchaseOrder = await updatePurchaseOrderStatus(
      orgSlug,
      purchaseOrderId,
      status,
      options
    );

    revalidatePath(`/org/${orgSlug}/compras`);
    revalidatePath(`/org/${orgSlug}/compras/${purchaseOrderId}`);

    return {
      success: true,
      data: purchaseOrder,
    };
  } catch (error) {
    console.error("Error updating purchase order status:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error al actualizar el estado de la compra",
    };
  }
}

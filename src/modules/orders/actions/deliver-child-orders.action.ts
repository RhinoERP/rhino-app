"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { deliverChildOrders } from "../service/orders.service";

export type DeliverChildOrdersInput = {
  orgSlug: string;
  childOrderIds: string[];
  notes?: string;
};

export type DeliverChildOrdersResult = {
  success: boolean;
  error?: string;
};

export async function deliverChildOrdersAction(
  input: DeliverChildOrdersInput
): Promise<DeliverChildOrdersResult> {
  await ensure("orders.dispatch", input.orgSlug);
  try {
    const { orgSlug, childOrderIds, notes } = input;
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

    const ids = Array.from(new Set(childOrderIds));
    if (ids.length === 0) {
      throw new Error("Seleccioná al menos un subpedido para entregar");
    }

    const { data: orders } = await supabase
      .from("orders")
      .select("id, parent_order_id")
      .in("id", ids)
      .eq("organization_id", org.id);

    if (!orders || orders.length !== ids.length) {
      throw new Error("Uno o más pedidos no fueron encontrados");
    }

    const parentId = orders[0].parent_order_id ?? orders[0].id;

    await deliverChildOrders({
      orgSlug,
      orgId: org.id,
      childOrderIds: ids,
      parentOrderId: parentId,
      notes: notes?.trim() || undefined,
      userId: user.id,
    });

    revalidatePath(`/org/${orgSlug}/despacho`);
    revalidatePath(`/org/${orgSlug}/pedidos`);
    revalidatePath(`/org/${orgSlug}/pedidos/${parentId}`);

    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error desconocido";
    return { success: false, error: message };
  }
}

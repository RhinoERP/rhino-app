"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { dispatchChildOrder } from "../service/orders.service";

export type DispatchChildOrderInput = {
  orgSlug: string;
  childOrderId: string;
  remitoNumber: string;
  notes?: string;
};

export type DispatchChildOrderResult = {
  success: boolean;
  error?: string;
};

export async function dispatchChildOrderAction(
  input: DispatchChildOrderInput
): Promise<DispatchChildOrderResult> {
  try {
    const { orgSlug, childOrderId, remitoNumber, notes } = input;
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

    if (!remitoNumber.trim()) {
      throw new Error("El número de remito es obligatorio");
    }

    const { data: childOrder, error: fetchError } = await supabase
      .from("orders")
      .select("id, parent_order_id")
      .eq("id", childOrderId)
      .eq("organization_id", org.id)
      .single();

    if (fetchError || !childOrder) {
      throw new Error("Pedido no encontrado");
    }

    const parentId = childOrder.parent_order_id ?? childOrderId;

    await dispatchChildOrder({
      orgId: org.id,
      childOrderId,
      parentOrderId: parentId,
      remitoNumber: remitoNumber.trim(),
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

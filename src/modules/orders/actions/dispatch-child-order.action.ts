"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { uploadOrderDocument } from "@/modules/sales/server/documents-storage.service";
import { generateOrderRemittancePdfDocument } from "../server/order-remittance-pdf-document.service";
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
  await ensure("orders.dispatch", input.orgSlug);
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
      orgSlug,
      orgId: org.id,
      childOrderId,
      parentOrderId: parentId,
      remitoNumber: remitoNumber.trim(),
      notes: notes?.trim() || undefined,
      userId: user.id,
    });

    try {
      const pdfDoc = await generateOrderRemittancePdfDocument({
        orgSlug,
        childOrderId,
        remitoNumber: remitoNumber.trim(),
      });

      const uploadResult = await uploadOrderDocument({
        orgSlug,
        orderId: childOrderId,
        type: "order_remittos",
        filename: pdfDoc.filename,
        content: pdfDoc.content,
      });

      if (uploadResult.success) {
        await supabase
          .from("order_dispatch_events")
          .update({ remittance_pdf_url: uploadResult.url })
          .eq("order_id", childOrderId)
          .eq("remito_number", remitoNumber.trim());
      }
    } catch (e) {
      console.error("Failed to generate/upload remittance PDF on dispatch:", e);
    }

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

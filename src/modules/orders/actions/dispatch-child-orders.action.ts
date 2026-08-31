"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { uploadOrderDocument } from "@/modules/sales/server/documents-storage.service";
import { generateOrderRemittancePdfDocument } from "../server/order-remittance-pdf-document.service";
import { dispatchChildOrders } from "../service/orders.service";

export type DispatchChildOrdersInput = {
  orgSlug: string;
  childOrderIds: string[];
  remitoNumber: string;
  packageCount?: number | null;
  declaredValue?: number | null;
  notes?: string;
};

export type DispatchChildOrdersResult = {
  success: boolean;
  error?: string;
};

export async function dispatchChildOrdersAction(
  input: DispatchChildOrdersInput
): Promise<DispatchChildOrdersResult> {
  await ensure("orders.dispatch", input.orgSlug);
  try {
    const {
      orgSlug,
      childOrderIds,
      remitoNumber,
      packageCount,
      declaredValue,
      notes,
    } = input;
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
      throw new Error("Seleccioná al menos un subpedido para despachar");
    }

    if (!remitoNumber.trim()) {
      throw new Error("El número de remito es obligatorio");
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

    await dispatchChildOrders({
      orgSlug,
      orgId: org.id,
      childOrderIds: ids,
      parentOrderId: parentId,
      remitoNumber: remitoNumber.trim(),
      packageCount,
      declaredValue,
      notes: notes?.trim() || undefined,
      userId: user.id,
    });

    try {
      const pdfDoc = await generateOrderRemittancePdfDocument({
        orgSlug,
        childOrderIds: ids,
        remitoNumber: remitoNumber.trim(),
      });

      const uploadResult = await uploadOrderDocument({
        orgSlug,
        orderId: ids[0],
        type: "order_remittos",
        filename: pdfDoc.filename,
        content: pdfDoc.content,
      });

      if (uploadResult.success) {
        await supabase
          .from("order_dispatch_events")
          .update({ remittance_pdf_url: uploadResult.url })
          .in("order_id", ids)
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

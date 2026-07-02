"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ConfirmStockReviewResult = {
  success: boolean;
  error?: string;
};

export async function confirmStockReviewAction(
  orgSlug: string,
  parentOrderId: string
): Promise<ConfirmStockReviewResult> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error: updateError } = await supabase
      .from("orders")
      .update({ status: "STOCK_OK" })
      .eq("id", parentOrderId);

    if (updateError) {
      throw new Error(`Error al actualizar estado: ${updateError.message}`);
    }

    const { error: historyError } = await supabase
      .from("order_status_history")
      .insert({
        order_id: parentOrderId,
        from_status: "PENDING_STOCK",
        to_status: "STOCK_OK",
        notes: "Revisión de stock confirmada.",
        changed_by: user?.id ?? null,
        changed_at: new Date().toISOString(),
      });

    if (historyError) {
      throw new Error(`Error al registrar historial: ${historyError.message}`);
    }

    revalidatePath(`/org/${orgSlug}/pedidos`);
    revalidatePath(`/org/${orgSlug}/compras/stock-pedidos`);
    revalidatePath(`/org/${orgSlug}/pedidos/${parentOrderId}`);

    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error desconocido";
    return { success: false, error: message };
  }
}

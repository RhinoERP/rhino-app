"use server";

import { getCurrentUserId } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createOrderFromQuote } from "../service/orders.service";

export async function createOrderFromQuoteAction(
  orgSlug: string,
  quoteId: string
): Promise<{ success: boolean; orderId?: string; error?: string }> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: "No autenticado" };
    }

    // Marcar el presupuesto como CONVERTED
    const supabase = await createClient();
    await supabase
      .from("quotes")
      .update({ status: "CONVERTED" })
      .eq("id", quoteId);

    const orderId = await createOrderFromQuote(orgSlug, quoteId, userId);
    return { success: true, orderId };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}

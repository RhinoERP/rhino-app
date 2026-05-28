"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
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

    const supabase = await createClient();

    const org = await getOrganizationBySlug(orgSlug);
    if (!org) {
      return { success: false, error: "Organización no encontrada" };
    }

    const { data: existingQuote } = await supabase
      .from("quotes")
      .select("id, status")
      .eq("id", quoteId)
      .eq("organization_id", org.id)
      .maybeSingle();

    if (!existingQuote) {
      return { success: false, error: "Presupuesto no encontrado" };
    }

    if (existingQuote.status === "CONVERTED") {
      return {
        success: false,
        error: "Este presupuesto ya fue convertido a pedido",
      };
    }

    const orderId = await createOrderFromQuote(orgSlug, quoteId, userId);

    const { error: quoteUpdateError } = await supabase
      .from("quotes")
      .update({ status: "CONVERTED" })
      .eq("id", quoteId)
      .eq("organization_id", org.id);

    if (quoteUpdateError) {
      throw new Error("Error al marcar el presupuesto como convertido");
    }

    revalidatePath(`/org/${orgSlug}/pedidos`);
    revalidatePath(`/org/${orgSlug}/finanzas`);

    return { success: true, orderId };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}

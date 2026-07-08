"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { QuoteStatus } from "../types";

type UpdateQuoteStatusInput = {
  orgSlug: string;
  quoteId: string;
  newStatus: QuoteStatus;
};

type UpdateQuoteStatusResult =
  | { success: true }
  | { success: false; error: string };

export async function updateQuoteStatusAction(
  input: UpdateQuoteStatusInput
): Promise<UpdateQuoteStatusResult> {
  try {
    const { orgSlug, quoteId, newStatus } = input;
    const supabase = await createClient();
    const org = await getOrganizationBySlug(orgSlug);

    if (!org?.id) {
      return { success: false, error: "Organización no encontrada" };
    }

    const { data: quote, error: fetchError } = await supabase
      .from("quotes")
      .select("id, status")
      .eq("id", quoteId)
      .eq("organization_id", org.id)
      .single();

    if (fetchError || !quote) {
      return { success: false, error: "Presupuesto no encontrado" };
    }

    const { error: updateError } = await supabase
      .from("quotes")
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", quoteId)
      .eq("organization_id", org.id);

    if (updateError) {
      return {
        success: false,
        error: `Error al actualizar el presupuesto: ${updateError.message}`,
      };
    }

    revalidatePath(`/org/${orgSlug}/listas-de-presupuestos`);
    revalidatePath(`/org/${orgSlug}/presupuestos/${quoteId}/editar`);

    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error desconocido";
    return { success: false, error: message };
  }
}

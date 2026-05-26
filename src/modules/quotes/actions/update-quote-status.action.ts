"use server";

import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { QuoteStatus } from "../types";

export async function updateQuoteStatusAction(
  orgSlug: string,
  quoteId: string,
  newStatus: QuoteStatus
): Promise<{ success: boolean; error?: string }> {
  try {
    const org = await getOrganizationBySlug(orgSlug);
    if (!org) {
      return { success: false, error: "Organización no encontrada" };
    }

    const supabase = await createClient();

    const { error } = await supabase
      .from("quotes")
      .update({ status: newStatus })
      .eq("id", quoteId)
      .eq("organization_id", org.id);

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}

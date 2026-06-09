"use server";

import { createClient } from "@/lib/supabase/server";
import type { QuoteItemRow, QuoteRow } from "../types";

export type QuoteDetails = QuoteRow & {
  customers: {
    id: string;
    business_name: string;
    fantasy_name: string | null;
    cuit: string | null;
  } | null;
  quote_items: QuoteItemRow[];
};

export async function getQuoteById(
  quoteId: string
): Promise<QuoteDetails | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quotes")
    .select(`
      *,
        customers (
        id,
        business_name,
        fantasy_name,
        cuit
      ),
      quote_items (*)
    `)
    .eq("id", quoteId)
    .single();

  if (error) {
    console.error("Error al obtener el presupuesto:", error);
    return null;
  }
  return data;
}

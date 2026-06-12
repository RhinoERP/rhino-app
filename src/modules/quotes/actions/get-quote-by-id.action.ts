"use server";

import { createClient } from "@/lib/supabase/server";
import type { QuoteItemExtraRow, QuoteItemRow, QuoteRow } from "../types";

export type QuoteDetails = QuoteRow & {
  purchase_order_file?: string | null;
  customers: {
    id: string;
    business_name: string;
    fantasy_name: string | null;
    cuit: string | null;
    phone: string | null;
    email: string | null;
  } | null;
  quote_items: (QuoteItemRow & {
    quote_item_extras: QuoteItemExtraRow[];
  })[];
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
        cuit,
        phone,
        email
      ),
      quote_items (
        *,
        quote_item_extras (*)
      )
    `)
    .eq("id", quoteId)
    .single();

  if (error) {
    return null;
  }
  return data as QuoteDetails | null;
}

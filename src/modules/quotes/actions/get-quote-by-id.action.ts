"use server";

import { createClient } from "@/lib/supabase/server";
import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import type {
  QuoteItemExtraRow,
  QuoteItemRow,
  QuoteItemTaxRow,
  QuoteRow,
  QuoteTaxRow,
} from "../types";

export type QuoteDetails = QuoteRow & {
  purchase_order_file?: string | null;
  design_file_url?: string | null;
  parent_quote_id?: string | null;
  price_level_id?: string | null;
  sales_price_list_id?: string | null;
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
    quote_item_taxes: QuoteItemTaxRow[];
  })[];
  quote_taxes: QuoteTaxRow[];
};

export async function getQuoteById(
  quoteId: string,
  orgSlug: string
): Promise<QuoteDetails | null> {
  await ensure(READ_PERMISSIONS.quotes, orgSlug);
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
        quote_item_extras (*),
        quote_item_taxes (*)
      ),
      quote_taxes (*)
    `)
    .eq("id", quoteId)
    .single();

  if (error) {
    return null;
  }
  return data as QuoteDetails | null;
}

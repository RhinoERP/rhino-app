"use server";

import { createClient } from "@/lib/supabase/server";
import type { QuoteRow } from "../types";

export type QuoteVersion = Pick<
  QuoteRow,
  "id" | "status" | "created_at" | "created_by" | "total_amount" | "currency"
>;

export async function getQuoteVersionsAction(
  quoteId: string
): Promise<QuoteVersion[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("quotes")
    .select("id, status, created_at, created_by, total_amount, currency")
    .eq("parent_quote_id", quoteId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(
      `Error al obtener versiones del presupuesto: ${error.message}`
    );
  }

  return data ?? [];
}

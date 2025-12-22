import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

export type Tax = Database["public"]["Tables"]["taxes"]["Row"];

/**
 * Returns all active taxes
 */
export async function getActiveTaxes(): Promise<Tax[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("taxes")
    .select("*")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Error fetching taxes: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Returns all taxes (including inactive ones)
 */
export async function getAllTaxes(): Promise<Tax[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("taxes")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Error fetching taxes: ${error.message}`);
  }

  return data ?? [];
}

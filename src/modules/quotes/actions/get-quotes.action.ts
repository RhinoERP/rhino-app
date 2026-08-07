"use server";

import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import type { QuoteRow } from "../types";

// Combinamos el presupuesto con los datos básicos del cliente asociado
export type QuoteWithCustomer = QuoteRow & {
  customers: {
    id: string;
    business_name: string;
    fantasy_name: string | null;
    phone: string | null;
    email: string | null;
  } | null;
  quote_items: {
    quantity: number;
  }[];
};

/**
 * Obtiene todos los presupuestos de una organización ordenados por fecha de creación descendente.
 */
export async function getQuotesAction(
  orgSlug: string
): Promise<QuoteWithCustomer[]> {
  await ensure(["quotes.read", "quotes.read.all", "quotes.manage"], orgSlug);
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    return [];
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("quotes")
    .select(`
      *,
      customers (
        id,
        business_name,
        fantasy_name,
        phone,
        email
      ),
      quote_items (
        quantity
      )
    `)
    .eq("organization_id", org.id)
    .is("parent_quote_id", null)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Error al obtener los presupuestos: ${error.message}`);
  }

  return data ?? [];
}

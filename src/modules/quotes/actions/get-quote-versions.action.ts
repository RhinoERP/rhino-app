"use server";

import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import type { QuoteRow } from "../types";

export type QuoteVersion = Pick<
  QuoteRow,
  "id" | "status" | "created_at" | "created_by" | "total_amount" | "currency"
>;

export async function getQuoteVersionsAction(
  orgSlug: string,
  quoteId: string
): Promise<QuoteVersion[]> {
  await ensure(READ_PERMISSIONS.quotes, orgSlug);
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    return [];
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("quotes")
    .select("id, status, created_at, created_by, total_amount, currency")
    .eq("parent_quote_id", quoteId)
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(
      `Error al obtener versiones del presupuesto: ${error.message}`
    );
  }

  return data ?? [];
}

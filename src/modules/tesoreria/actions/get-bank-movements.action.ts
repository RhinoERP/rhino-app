"use server";

import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { BankMovement } from "../types";

export async function getBankMovementsAction(
  orgSlug: string,
  filters?: {
    from?: string;
    to?: string;
    type?: string;
    bank_account_id?: string;
  }
): Promise<BankMovement[]> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) return [];

  const supabase = await createClient();

  let query = supabase
    .from("bank_movements")
    .select(
      `
      *,
      bank_account:bank_accounts(name, bank_name)
    `
    )
    .eq("organization_id", org.id)
    .order("movement_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (filters?.from) query = query.gte("movement_date", filters.from);
  if (filters?.to) query = query.lte("movement_date", filters.to);
  if (filters?.type) query = query.eq("movement_type", filters.type);
  if (filters?.bank_account_id)
    query = query.eq("bank_account_id", filters.bank_account_id);

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching bank movements:", error);
    return [];
  }

  return (data ?? []) as BankMovement[];
}

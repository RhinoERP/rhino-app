"use server";

import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { BankAccount } from "../types";

export async function getBankAccountsAction(
  orgSlug: string
): Promise<BankAccount[]> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bank_accounts")
    .select("*")
    .eq("organization_id", org.id)
    .eq("is_active", true)
    .order("name");

  if (error) {
    console.error("Error fetching bank accounts:", error);
    return [];
  }

  return (data ?? []) as BankAccount[];
}

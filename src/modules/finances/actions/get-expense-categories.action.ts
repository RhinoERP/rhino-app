"use server";

import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import type { ExpenseCategory } from "../types";

export async function getExpenseCategoriesAction(
  orgSlug: string
): Promise<ExpenseCategory[]> {
  await ensure("finances.manage", orgSlug);
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    return [];
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expense_categories")
    .select("*")
    .eq("organization_id", org.id)
    .order("name");

  if (error) {
    throw new Error(error.message);
  }
  return data ?? [];
}

"use server";

import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { OrganizationExpense } from "../types";

export async function getExpensesAction(
  orgSlug: string,
  filters?: { from?: string; to?: string; categoryId?: string }
): Promise<OrganizationExpense[]> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    return [];
  }

  const supabase = await createClient();
  let query = supabase
    .from("organization_expenses")
    .select("*, category:expense_categories(*)")
    .eq("organization_id", org.id)
    .order("expense_date", { ascending: false });

  if (filters?.from) {
    query = query.gte("expense_date", filters.from);
  }
  if (filters?.to) {
    query = query.lte("expense_date", filters.to);
  }
  if (filters?.categoryId) {
    query = query.eq("category_id", filters.categoryId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as OrganizationExpense[];
}

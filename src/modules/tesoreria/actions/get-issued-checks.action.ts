"use server";

import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { IssuedCheck, LiquidityAlert } from "../types";

export async function getIssuedChecksAction(
  orgSlug: string,
  status?: string
): Promise<IssuedCheck[]> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) return [];

  const supabase = await createClient();

  let query = supabase
    .from("issued_checks")
    .select(
      `
      *,
      bank_account:bank_accounts(name, bank_name)
    `
    )
    .eq("organization_id", org.id)
    .order("payment_date", { ascending: true });

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching issued checks:", error);
    return [];
  }

  return (data ?? []) as IssuedCheck[];
}

export async function getLiquidityAlertAction(
  orgSlug: string,
  date: string // YYYY-MM-DD
): Promise<LiquidityAlert | null> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) return null;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("issued_checks")
    .select(`*, bank_account:bank_accounts(name, bank_name)`)
    .eq("organization_id", org.id)
    .eq("payment_date", date)
    .eq("status", "pending");

  if (error || !data || data.length === 0) return null;

  const checks = data as IssuedCheck[];
  const totalAmount = checks.reduce((sum, c) => sum + c.amount, 0);

  return { date, checks, totalAmount };
}

"use server";

import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type {
  CreateIssuedCheckInput,
  IssuedCheck,
  UpdateCheckStatusInput,
} from "../types";

type Result =
  | { success: true; check: IssuedCheck }
  | { success: false; error: string };

export async function createIssuedCheckAction(
  orgSlug: string,
  input: CreateIssuedCheckInput
): Promise<Result> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) return { success: false, error: "Organización no encontrada" };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("issued_checks")
    .insert({
      organization_id: org.id,
      ...input,
      status: "pending",
    })
    .select("*")
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, check: data as IssuedCheck };
}

export async function updateCheckStatusAction(
  orgSlug: string,
  input: UpdateCheckStatusInput
): Promise<{ success: boolean; error?: string }> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) return { success: false, error: "Organización no encontrada" };

  const supabase = await createClient();

  const { error } = await supabase
    .from("issued_checks")
    .update({ status: input.status })
    .eq("id", input.id)
    .eq("organization_id", org.id);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

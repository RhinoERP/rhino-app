"use server";

import { revalidatePath } from "next/cache";
import { generateId } from "@/lib/id";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { ExpenseCategory } from "../types";

type CategoryInput = {
  name: string;
  color: string | null;
  is_fixed: boolean;
};

type CategoryResult =
  | { success: true; category: ExpenseCategory }
  | { success: false; error: string };

type DeleteResult = { success: true } | { success: false; error: string };

export async function createExpenseCategoryAction(
  orgSlug: string,
  input: CategoryInput
): Promise<CategoryResult> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    return { success: false, error: "Organización no encontrada" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expense_categories")
    .insert({
      id: generateId(),
      organization_id: org.id,
      name: input.name.trim(),
      color: input.color || null,
      is_fixed: input.is_fixed,
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/org/${orgSlug}/finanzas`);
  return { success: true, category: data as ExpenseCategory };
}

export async function updateExpenseCategoryAction(
  orgSlug: string,
  id: string,
  input: CategoryInput
): Promise<CategoryResult> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    return { success: false, error: "Organización no encontrada" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expense_categories")
    .update({
      name: input.name.trim(),
      color: input.color || null,
      is_fixed: input.is_fixed,
    })
    .eq("id", id)
    .eq("organization_id", org.id)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/org/${orgSlug}/finanzas`);
  return { success: true, category: data as ExpenseCategory };
}

export async function deleteExpenseCategoryAction(
  orgSlug: string,
  id: string
): Promise<DeleteResult> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    return { success: false, error: "Organización no encontrada" };
  }

  const supabase = await createClient();

  const { count } = await supabase
    .from("organization_expenses")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", org.id)
    .eq("category_id", id);

  if (count && count > 0) {
    return {
      success: false,
      error: `No se puede eliminar: ${count} gasto${count === 1 ? "" : "s"} usa${count === 1 ? "" : "n"} esta categoría`,
    };
  }

  const { error } = await supabase
    .from("expense_categories")
    .delete()
    .eq("id", id)
    .eq("organization_id", org.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/org/${orgSlug}/finanzas`);
  return { success: true };
}

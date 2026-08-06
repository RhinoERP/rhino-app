"use server";

import { revalidatePath } from "next/cache";
import { generateId } from "@/lib/id";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import type {
  CreateExpenseInput,
  DeleteExpenseResult,
  ExpenseActionResult,
  OrganizationExpense,
  UpdateExpenseInput,
} from "../types";

export async function createExpenseAction(
  orgSlug: string,
  input: CreateExpenseInput
): Promise<ExpenseActionResult> {
  await ensure("finances.manage", orgSlug);
  try {
    const org = await getOrganizationBySlug(orgSlug);
    if (!org) {
      return { success: false, error: "Organización no encontrada" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("organization_expenses")
      .insert({
        id: generateId(),
        organization_id: org.id,
        category_id: input.categoryId,
        description: input.description,
        amount: input.amount,
        expense_date: input.expense_date,
        payment_method: input.payment_method ?? null,
        reference_number: input.reference_number ?? null,
        notes: input.notes ?? null,
      })
      .select("*, category:expense_categories(*)")
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath(`/org/${orgSlug}/finanzas`);
    return { success: true, expense: data as OrganizationExpense };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error al crear gasto",
    };
  }
}

export async function updateExpenseAction(
  orgSlug: string,
  input: UpdateExpenseInput
): Promise<ExpenseActionResult> {
  await ensure("finances.manage", orgSlug);
  try {
    const org = await getOrganizationBySlug(orgSlug);
    if (!org) {
      return { success: false, error: "Organización no encontrada" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("organization_expenses")
      .update({
        category_id: input.categoryId,
        description: input.description,
        amount: input.amount,
        expense_date: input.expense_date,
        payment_method: input.payment_method ?? null,
        reference_number: input.reference_number ?? null,
        notes: input.notes ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id)
      .eq("organization_id", org.id)
      .select("*, category:expense_categories(*)")
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath(`/org/${orgSlug}/finanzas`);
    return { success: true, expense: data as OrganizationExpense };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error al actualizar gasto",
    };
  }
}

export async function deleteExpenseAction(
  orgSlug: string,
  expenseId: string
): Promise<DeleteExpenseResult> {
  await ensure("finances.manage", orgSlug);
  try {
    const org = await getOrganizationBySlug(orgSlug);
    if (!org) {
      return { success: false, error: "Organización no encontrada" };
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("organization_expenses")
      .delete()
      .eq("id", expenseId)
      .eq("organization_id", org.id);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath(`/org/${orgSlug}/finanzas`);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error al eliminar gasto",
    };
  }
}

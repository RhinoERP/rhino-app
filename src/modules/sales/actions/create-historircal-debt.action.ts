"use server";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/supabase/auth";
import { createHistoricalDebts } from "../service/historical-debt.service";
import type { CreateHistoricalDebtInput } from "../types";

export async function createHistoricalDebtsAction(
  input: CreateHistoricalDebtInput
): Promise<{ success: boolean; imported: number; errors: string[] }> {
  await requireAuth();

  try {
    const result = await createHistoricalDebts(input);
    revalidatePath(`/org/${input.orgSlug}/cobranzas`);
    return { success: result.errors.length === 0, ...result };
  } catch (error) {
    return {
      success: false,
      imported: 0,
      errors: [error instanceof Error ? error.message : "Error desconocido"],
    };
  }
}

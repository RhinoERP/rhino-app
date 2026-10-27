"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUserId, isSuperAdmin } from "@/lib/supabase/admin";
import { createAdminClient } from "@/lib/supabase/admin-client";

const limitsSchema = z.object({
  organizationId: z.uuid(),
  orgSlug: z.string().min(1),
  monthlyUsdLimit: z.number().min(0).max(100_000).nullable(),
  perUserMonthlyUsdLimit: z.number().min(0).max(100_000).nullable(),
  notes: z.string().trim().max(500),
});

export type LimitsActionResult = { success: boolean; error?: string };

/** Solo un superadmin de Rhinos fija cuánto puede gastar en IA cada organización. */
export async function setOrgAiLimitsAction(
  input: z.infer<typeof limitsSchema>
): Promise<LimitsActionResult> {
  try {
    const data = limitsSchema.parse(input);
    if (!(await isSuperAdmin())) {
      throw new Error(
        "Solo un administrador de Rhinos puede cambiar los topes de IA."
      );
    }
    const userId = await getCurrentUserId();
    const { error } = await createAdminClient()
      .from("commercial_ai_limits")
      .upsert(
        {
          organization_id: data.organizationId,
          monthly_usd_limit: data.monthlyUsdLimit,
          per_user_monthly_usd_limit: data.perUserMonthlyUsdLimit,
          notes: data.notes,
          updated_by: userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id" }
      );
    if (error) {
      throw new Error(error.message);
    }
    revalidatePath(`/admin/organizacion/${data.orgSlug}/ia`);
    revalidatePath(`/org/${data.orgSlug}/ia-comercial`);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo guardar",
    };
  }
}

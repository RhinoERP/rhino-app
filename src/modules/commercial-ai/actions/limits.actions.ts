"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUserId, isSuperAdmin } from "@/lib/supabase/admin";
import { createAdminClient } from "@/lib/supabase/admin-client";

const MAX_CREDITS = 10_000_000;

const limitsSchema = z.object({
  organizationId: z.uuid(),
  orgSlug: z.string().min(1),
  /** null = sin tope (se mide pero no se corta). */
  monthlyIncludedCredits: z.number().int().min(0).max(MAX_CREDITS).nullable(),
  perUserMonthlyCredits: z.number().int().min(0).max(MAX_CREDITS).nullable(),
  notes: z.string().trim().max(500),
});

const adjustSchema = z.object({
  organizationId: z.uuid(),
  orgSlug: z.string().min(1),
  credits: z
    .number()
    .min(-MAX_CREDITS)
    .max(MAX_CREDITS)
    .refine((value) => value !== 0, "Poné una cantidad distinta de cero"),
  note: z.string().trim().min(3, "Anotá el motivo").max(300),
});

export type LimitsActionResult = { success: boolean; error?: string };

async function requireSuperAdmin(): Promise<string | null> {
  if (!(await isSuperAdmin())) {
    throw new Error(
      "Solo un administrador de Rhinos puede cambiar los créditos."
    );
  }
  return getCurrentUserId();
}

function revalidate(orgSlug: string) {
  revalidatePath(`/admin/organizacion/${orgSlug}/ia`);
  revalidatePath(`/org/${orgSlug}/ia-comercial`);
}

function failure(error: unknown): LimitsActionResult {
  return {
    success: false,
    error: error instanceof Error ? error.message : "No se pudo guardar",
  };
}

/** Solo un superadmin de Rhinos fija el plan de créditos de cada organización. */
export async function setOrgAiLimitsAction(
  input: z.infer<typeof limitsSchema>
): Promise<LimitsActionResult> {
  try {
    const data = limitsSchema.parse(input);
    const userId = await requireSuperAdmin();
    const { error } = await createAdminClient()
      .from("commercial_ai_limits")
      .upsert(
        {
          organization_id: data.organizationId,
          monthly_included_credits: data.monthlyIncludedCredits,
          per_user_monthly_credits: data.perUserMonthlyCredits,
          unlimited: data.monthlyIncludedCredits === null,
          notes: data.notes,
          updated_by: userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id" }
      );
    if (error) {
      throw new Error(error.message);
    }
    revalidate(data.orgSlug);
    return { success: true };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Carga (o descuenta) créditos comprados a mano: pagos por transferencia,
 * bonificaciones o correcciones. Queda en el historial con el motivo.
 */
export async function adjustOrgCreditsAction(
  input: z.infer<typeof adjustSchema>
): Promise<LimitsActionResult> {
  try {
    const data = adjustSchema.parse(input);
    const userId = await requireSuperAdmin();
    const { error } = await createAdminClient().rpc(
      "commercial_ai_add_credits",
      {
        p_org: data.organizationId,
        p_credits: data.credits,
        p_kind: "ajuste",
        p_note: data.note,
        p_purchase: null,
        p_by: userId,
      }
    );
    if (error) {
      throw new Error(error.message);
    }
    revalidate(data.orgSlug);
    return { success: true };
  } catch (error) {
    return failure(error);
  }
}

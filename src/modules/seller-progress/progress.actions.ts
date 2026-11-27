"use server";

import { revalidatePath } from "next/cache";
import type { KpiValues } from "./progress";
import { saveSellerProgressGoal } from "./progress.service";

export async function saveProgressGoalAction(input: {
  orgSlug: string;
  sellerId: string;
  month: string;
  targets: KpiValues;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    await saveSellerProgressGoal(input);
    revalidatePath(`/org/${input.orgSlug}/mi-progreso`);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "No se pudo guardar la meta.",
    };
  }
}

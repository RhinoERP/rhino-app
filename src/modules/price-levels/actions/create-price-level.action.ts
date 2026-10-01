"use server";

import { requireAuth } from "@/lib/supabase/auth";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { createPriceLevel } from "../service/price-levels.service";
import type { CreatePriceLevelInput, PriceLevel } from "../types";

export type CreatePriceLevelActionResult = {
  success: boolean;
  error?: string;
  priceLevel?: PriceLevel;
};

export async function createPriceLevelAction(
  input: CreatePriceLevelInput
): Promise<CreatePriceLevelActionResult> {
  try {
    await requireAuth();

    const org = await getOrganizationBySlug(input.orgSlug);
    const commissionsEnabled = org?.commissions_enabled === true;

    const priceLevel = await createPriceLevel({
      ...input,
      // La comisión extra solo se persiste si el módulo de comisiones está activo.
      extraCommissionRate: commissionsEnabled
        ? input.extraCommissionRate
        : undefined,
    });

    return { success: true, priceLevel };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al crear el nivel de precio",
    };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/supabase/auth";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { updatePriceLevel } from "../service/price-levels.service";
import type { PriceLevel, UpdatePriceLevelInput } from "../types";

export type UpdatePriceLevelActionResult =
  | { success: true; data: PriceLevel }
  | { success: false; error: string };

export async function updatePriceLevelAction(
  orgSlug: string,
  priceLevelId: string,
  input: UpdatePriceLevelInput
): Promise<UpdatePriceLevelActionResult> {
  try {
    await requireAuth();

    const org = await getOrganizationBySlug(orgSlug);
    const commissionsEnabled = org?.commissions_enabled === true;

    const priceLevel = await updatePriceLevel(orgSlug, priceLevelId, {
      ...input,
      // La comisión extra solo se persiste si el módulo de comisiones está activo.
      // Si no, se omite para conservar el valor existente.
      extraCommissionRate: commissionsEnabled
        ? input.extraCommissionRate
        : undefined,
    });

    revalidatePath(`/org/${orgSlug}/precios/listas-de-precios-venta`);
    revalidatePath(`/org/${orgSlug}/configuracion/listas-de-precios-venta`);

    return { success: true, data: priceLevel };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error al actualizar el nivel de precio",
    };
  }
}

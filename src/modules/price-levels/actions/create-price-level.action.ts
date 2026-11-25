"use server";

import { revalidatePath } from "next/cache";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
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
  await ensure("pricelists.manage", input.orgSlug);
  try {
    const org = await getOrganizationBySlug(input.orgSlug);
    const commissionsEnabled = org?.commissions_enabled === true;

    const priceLevel = await createPriceLevel({
      ...input,
      // La comisión extra solo se persiste si el módulo de comisiones está activo.
      extraCommissionRate: commissionsEnabled
        ? input.extraCommissionRate
        : undefined,
    });

    revalidatePath(`/org/${input.orgSlug}/precios/listas-de-precios-venta`);
    revalidatePath(
      `/org/${input.orgSlug}/configuracion/listas-de-precios-venta`
    );

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

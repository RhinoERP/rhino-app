"use server";

import { revalidatePath } from "next/cache";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { deletePriceLevel } from "../service/price-levels.service";

export type DeletePriceLevelActionResult = {
  success: boolean;
  error?: string;
};

export async function deletePriceLevelAction(
  orgSlug: string,
  priceLevelId: string
): Promise<DeletePriceLevelActionResult> {
  await ensure("pricelists.manage", orgSlug);
  try {
    await deletePriceLevel(orgSlug, priceLevelId);

    revalidatePath(`/org/${orgSlug}/precios/listas-de-precios-venta`);
    revalidatePath(`/org/${orgSlug}/configuracion/listas-de-precios-venta`);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al eliminar el nivel de precio",
    };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { replacePriceList } from "../service/price-lists.service";

export async function replacePriceListAction(
  orgSlug: string,
  oldListId: string,
  newListId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await replacePriceList(orgSlug, oldListId, newListId);
    revalidatePath(`/org/${orgSlug}/precios/listas-de-precios`);
    revalidatePath(`/org/${orgSlug}/clientes`);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error desconocido",
    };
  }
}

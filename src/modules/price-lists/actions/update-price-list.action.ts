"use server";

import { revalidatePath } from "next/cache";
import {
  type UpdatePriceListInput,
  updatePriceList,
} from "../service/price-lists.service";

export async function updatePriceListAction(
  input: UpdatePriceListInput
): Promise<{ success: boolean; error?: string }> {
  try {
    await updatePriceList(input);

    // Revalidate relevant paths
    revalidatePath(`/org/${input.orgSlug}/precios/listas-de-precios`);
    revalidatePath(
      `/org/${input.orgSlug}/precios/listas-de-precios/${input.priceListId}`
    );

    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Error desconocido al actualizar la lista de precios";
    return { success: false, error: message };
  }
}

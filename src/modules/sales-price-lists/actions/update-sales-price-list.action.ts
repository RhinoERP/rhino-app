"use server";

import { revalidatePath } from "next/cache";
import { updateSalesPriceList } from "../service/sales-price-lists.service";
import type { UpdateSalesPriceListInput } from "../types";

export async function updateSalesPriceListAction(
  orgSlug: string,
  priceListId: string,
  input: UpdateSalesPriceListInput
) {
  try {
    const priceList = await updateSalesPriceList(orgSlug, priceListId, input);

    revalidatePath(`/org/${orgSlug}/precios/listas-de-precios-venta`);
    revalidatePath(`/org/${orgSlug}/configuracion/listas-de-precios-venta`);

    return {
      success: true,
      data: priceList,
    };
  } catch (error) {
    // Error updating sales price list
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error al actualizar la lista de precios",
    };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import {
  type UpdateSalesPriceListInput,
  updateSalesPriceList,
} from "../service/sales-price-lists.service";

export async function updateSalesPriceListAction(
  orgSlug: string,
  priceListId: string,
  input: UpdateSalesPriceListInput
) {
  try {
    const priceList = await updateSalesPriceList(orgSlug, priceListId, input);

    revalidatePath(`/org/${orgSlug}/configuracion/listas-de-precios-venta`);

    return {
      success: true,
      data: priceList,
    };
  } catch (error) {
    console.error("Error updating sales price list:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error al actualizar la lista de precios",
    };
  }
}

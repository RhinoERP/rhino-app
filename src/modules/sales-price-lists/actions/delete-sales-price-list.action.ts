"use server";

import { revalidatePath } from "next/cache";
import { deleteSalesPriceList } from "../service/sales-price-lists.service";

export type DeleteSalesPriceListActionResult = {
  success: boolean;
  error?: string;
};

export async function deleteSalesPriceListAction(
  orgSlug: string,
  priceListId: string
): Promise<DeleteSalesPriceListActionResult> {
  try {
    await deleteSalesPriceList(orgSlug, priceListId);

    revalidatePath(`/org/${orgSlug}/configuracion/listas-de-precios-venta`);

    return {
      success: true,
    };
  } catch (error) {
    // Error deleting sales price list
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al eliminar la lista de precios",
    };
  }
}

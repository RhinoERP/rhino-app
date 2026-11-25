"use server";

import { revalidatePath } from "next/cache";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { createSalesPriceList as createSalesPriceListService } from "../service/sales-price-lists.service";
import type { CreateSalesPriceListInput, SalesPriceList } from "../types";

export type CreateSalesPriceListActionResult = {
  success: boolean;
  error?: string;
  priceList?: SalesPriceList;
};

export async function createSalesPriceListAction(
  input: CreateSalesPriceListInput
): Promise<CreateSalesPriceListActionResult> {
  await ensure("pricelists.manage", input.orgSlug);
  try {
    const priceList = await createSalesPriceListService(input);

    revalidatePath(`/org/${input.orgSlug}/precios/listas-de-precios-venta`);
    revalidatePath(
      `/org/${input.orgSlug}/configuracion/listas-de-precios-venta`
    );

    return {
      success: true,
      priceList,
    };
  } catch (error) {
    // Error creating sales price list
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al crear la lista de precios",
    };
  }
}

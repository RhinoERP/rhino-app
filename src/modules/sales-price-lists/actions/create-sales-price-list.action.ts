"use server";

import {
  type CreateSalesPriceListInput,
  createSalesPriceList as createSalesPriceListService,
} from "../service/sales-price-lists.service";
import type { SalesPriceList } from "../types";

export type CreateSalesPriceListActionResult = {
  success: boolean;
  error?: string;
  priceList?: SalesPriceList;
};

export async function createSalesPriceListAction(
  input: CreateSalesPriceListInput
): Promise<CreateSalesPriceListActionResult> {
  try {
    const priceList = await createSalesPriceListService(input);

    return {
      success: true,
      priceList,
    };
  } catch (error) {
    console.error("Error creating sales price list:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al crear la lista de precios",
    };
  }
}

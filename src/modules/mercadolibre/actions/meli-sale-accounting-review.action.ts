"use server";

import { reviewMeliSaleAccounting } from "../service/meli-sale-accounting-review.service";

export async function reviewMeliSaleAccountingAction(
  orgSlug: string,
  saleId: string
) {
  try {
    return {
      success: true as const,
      data: await reviewMeliSaleAccounting(orgSlug, saleId),
    };
  } catch (error) {
    return {
      success: false as const,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo consultar la revisión contable.",
    };
  }
}

"use server";

import type { UpdateTaxInput } from "@/modules/taxes/service/taxes.service";
import { updateTaxById } from "@/modules/taxes/service/taxes.service";
import type { Tax } from "@/modules/taxes/types";

export type UpdateTaxActionResult = {
  success: boolean;
  error?: string;
  tax?: Tax;
};

export type UpdateTaxActionParams = {
  taxId: string;
} & UpdateTaxInput;

export async function updateTaxAction(
  params: UpdateTaxActionParams
): Promise<UpdateTaxActionResult> {
  try {
    const tax = await updateTaxById(params.taxId, {
      name: params.name,
      rate: params.rate,
      code: params.code,
      description: params.description,
      is_favorite_sales: params.is_favorite_sales,
      is_favorite_direct_sales: params.is_favorite_direct_sales,
    });

    return {
      success: true,
      tax,
    };
  } catch (error) {
    // Error updating tax
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al actualizar el impuesto",
    };
  }
}

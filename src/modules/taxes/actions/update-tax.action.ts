"use server";

import type { Tax } from "../service/taxes.service";
import { type UpdateTaxInput, updateTaxById } from "../service/taxes.service";

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
    });

    return {
      success: true,
      tax,
    };
  } catch (error) {
    console.error("Error updating tax:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al actualizar el impuesto",
    };
  }
}

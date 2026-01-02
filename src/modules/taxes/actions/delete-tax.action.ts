"use server";

import { deactivateTaxById } from "../service/taxes.service";

export type DeleteTaxActionResult = {
  success: boolean;
  error?: string;
};

export type DeleteTaxActionParams = {
  taxId: string;
};

export async function deleteTaxAction(
  params: DeleteTaxActionParams
): Promise<DeleteTaxActionResult> {
  try {
    await deactivateTaxById(params.taxId);
    return {
      success: true,
    };
  } catch (error) {
    console.error("Error deleting tax:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al eliminar el impuesto",
    };
  }
}

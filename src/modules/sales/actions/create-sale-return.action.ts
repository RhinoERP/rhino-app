"use server";

import {
  type CreateSaleReturnInput,
  type CreateSaleReturnResult,
  createSaleReturn,
} from "../service/sale-return.service";

type ActionResult =
  | { success: true; data: CreateSaleReturnResult }
  | { success: false; error: string };

export async function createSaleReturnAction(
  input: CreateSaleReturnInput
): Promise<ActionResult> {
  try {
    const data = await createSaleReturn(input);
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error al registrar la devolución",
    };
  }
}

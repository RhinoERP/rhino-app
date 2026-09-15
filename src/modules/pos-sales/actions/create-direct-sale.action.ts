"use server";

import { createDirectSale } from "../service/pos-sales.service";
import type { CreateDirectSaleInput } from "../types";

export type CreateDirectSaleActionResult = {
  success: boolean;
  posSaleId?: string;
  accountingStatus?: string;
  accountingSalePayload?: unknown;
  accountingPaymentPayload?: unknown;
  error?: string;
};

export async function createDirectSaleAction(
  input: CreateDirectSaleInput
): Promise<CreateDirectSaleActionResult> {
  try {
    const result = await createDirectSale(input);

    return {
      success: true,
      posSaleId: result.posSaleId,
      accountingStatus: result.accountingStatus,
      accountingSalePayload: result.accountingSalePayload ?? null,
      accountingPaymentPayload: result.accountingPaymentPayload ?? null,
    };
  } catch (error) {
    console.error("Error creating direct sale:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al registrar la venta directa",
    };
  }
}

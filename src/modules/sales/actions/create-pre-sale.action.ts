"use server";

import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { createPreSaleOrder } from "../service/sales.service";
import type { CreatePreSaleOrderInput } from "../types";

export type CreatePreSaleActionResult = {
  success: boolean;
  salesOrderId?: string;
  error?: string;
};

export async function createPreSaleAction(
  input: CreatePreSaleOrderInput
): Promise<CreatePreSaleActionResult> {
  await ensure("sales.manage", input.orgSlug);
  try {
    const salesOrderId = await createPreSaleOrder(input);

    return {
      success: true,
      salesOrderId,
    };
  } catch (error) {
    console.error("Error creating pre-sale:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al crear la preventa",
    };
  }
}

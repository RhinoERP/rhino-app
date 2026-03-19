"use server";

import { createDirectSale } from "../service/direct-sales.service";
import { type CreateDirectSaleInput, createDirectSaleSchema } from "../types";

export type CreateDirectSaleActionResult = {
  success: boolean;
  posSaleId?: string;
  error?: string;
};

export async function createDirectSaleAction(
  input: CreateDirectSaleInput
): Promise<CreateDirectSaleActionResult> {
  const parsed = createDirectSaleSchema.safeParse(input);

  if (!parsed.success) {
    const issue = parsed.error.issues[0];

    return {
      success: false,
      error:
        issue?.message ?? "Datos inválidos para registrar la venta directa.",
    };
  }

  try {
    const result = await createDirectSale(parsed.data);

    return {
      success: true,
      posSaleId: result.posSaleId,
    };
  } catch (error) {
    console.error("Error creating direct sale:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al registrar la venta directa.",
    };
  }
}

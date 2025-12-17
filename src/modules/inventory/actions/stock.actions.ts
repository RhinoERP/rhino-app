"use server";

import { revalidatePath } from "next/cache";
import {
  type CreateProductLotInput,
  type CreateStockMovementInput,
  createProductLotForOrg,
  createStockMovementForOrg,
} from "../service/inventory.service";

export type ProductLotActionResult = {
  success: boolean;
  error?: string;
  lotId?: string;
};

export type StockMovementActionResult = {
  success: boolean;
  error?: string;
  movementId?: string;
};

export async function createProductLotAction(
  input: CreateProductLotInput
): Promise<ProductLotActionResult> {
  try {
    const lot = await createProductLotForOrg(input);
    revalidatePath(`/org/${input.orgSlug}/stock`);
    revalidatePath(`/org/${input.orgSlug}/stock/${input.productId}`);

    return {
      success: true,
      lotId: lot.id,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al crear el lote",
    };
  }
}

export async function createStockMovementAction(
  input: CreateStockMovementInput
): Promise<StockMovementActionResult> {
  try {
    const movement = await createStockMovementForOrg(input);
    revalidatePath(`/org/${input.orgSlug}/stock`);
    revalidatePath(`/org/${input.orgSlug}/stock/${input.productId}`);

    return {
      success: true,
      movementId: movement?.id,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al registrar el movimiento",
    };
  }
}

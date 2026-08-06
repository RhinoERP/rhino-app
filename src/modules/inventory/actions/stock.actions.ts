"use server";

import { revalidatePath } from "next/cache";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import {
  type CreateProductLotInput,
  type CreateStockMovementInput,
  createProductLotForOrg,
  createStockMovementForOrg,
  type DeleteProductLotInput,
  deleteProductLotForOrg,
  type UpdateProductLotInput,
  updateProductLotForOrg,
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

export type DeleteProductLotActionResult = {
  success: boolean;
  error?: string;
};

export async function createProductLotAction(
  input: CreateProductLotInput
): Promise<ProductLotActionResult> {
  await ensure("inventory.manage", input.orgSlug);
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
  await ensure("inventory.manage", input.orgSlug);
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

export async function updateProductLotAction(
  input: UpdateProductLotInput
): Promise<ProductLotActionResult> {
  await ensure("inventory.manage", input.orgSlug);
  try {
    const lot = await updateProductLotForOrg(input);
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
          : "Error desconocido al editar el lote",
    };
  }
}

export async function deleteProductLotAction(
  input: DeleteProductLotInput
): Promise<DeleteProductLotActionResult> {
  await ensure("inventory.manage", input.orgSlug);
  try {
    await deleteProductLotForOrg(input);
    revalidatePath(`/org/${input.orgSlug}/stock`);
    revalidatePath(`/org/${input.orgSlug}/stock/${input.productId}`);

    return {
      success: true,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al eliminar el lote",
    };
  }
}

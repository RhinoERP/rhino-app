"use server";

import { revalidatePath } from "next/cache";
import {
  type CreateProductInput,
  createProductForOrg,
  type UpdateProductInput,
  updateProductForOrg,
} from "../service/inventory.service";

export type ProductActionResult = {
  success: boolean;
  error?: string;
  productId?: string;
};

export async function createProductAction(
  input: CreateProductInput
): Promise<ProductActionResult> {
  try {
    const result = await createProductForOrg(input);
    revalidatePath(`/org/${input.orgSlug}/stock`);

    const productId = Array.isArray(result) ? result[0]?.id : result.id;

    return {
      success: true,
      productId,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al crear el producto",
    };
  }
}

export async function updateProductAction(
  input: UpdateProductInput
): Promise<ProductActionResult> {
  try {
    const product = await updateProductForOrg(input);
    revalidatePath(`/org/${input.orgSlug}/stock`);
    revalidatePath(`/org/${input.orgSlug}/stock/${product.id}`);

    return {
      success: true,
      productId: product.id,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al actualizar el producto",
    };
  }
}

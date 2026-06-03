"use server";

import { revalidatePath } from "next/cache";
import {
  adjustVariantStock,
  type CreateProductInput,
  createProductForOrg,
  getProductVariantsByProductId,
  getProductVariantsWithStock,
  getVariantCurrentStock,
  type ProductVariantRow,
  type UpdateProductInput,
  updateProductForOrg,
  updateProductVariantsForOrg,
} from "../service/inventory.service";
import type { ProductVariantWithStock } from "../types";

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

export async function getProductVariantsAction(
  orgSlug: string,
  productId: string
): Promise<ProductVariantRow[]> {
  try {
    return await getProductVariantsByProductId(orgSlug, productId);
  } catch {
    return [];
  }
}

export async function adjustMultipleVariantsStockAction(
  orgSlug: string,
  adjustments: { variantId: string; newStock: number }[]
): Promise<ProductActionResult> {
  try {
    const productIds = new Set<string>();

    for (const adj of adjustments) {
      const { productId, currentStock } = await getVariantCurrentStock(
        adj.variantId
      );

      productIds.add(productId);

      const delta = adj.newStock - currentStock;

      if (delta !== 0) {
        await adjustVariantStock({
          orgSlug,
          variantId: adj.variantId,
          type: "ADJUSTMENT",
          quantity: delta,
          reason: "Ajuste manual de stock por variante",
        });
      }
    }

    revalidatePath(`/org/${orgSlug}/stock`);
    for (const productId of productIds) {
      revalidatePath(`/org/${orgSlug}/stock/${productId}`);
    }
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error al ajustar stock",
    };
  }
}

export async function updateProductVariantsAction(
  orgSlug: string,
  productId: string,
  talles: string[],
  colores: string[]
): Promise<ProductActionResult> {
  try {
    await updateProductVariantsForOrg(orgSlug, productId, talles, colores);
    revalidatePath(`/org/${orgSlug}/stock`);
    revalidatePath(`/org/${orgSlug}/stock/${productId}`);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error al actualizar variantes",
    };
  }
}

export async function getProductVariantsWithStockAction(
  orgSlug: string,
  productId: string
): Promise<ProductVariantWithStock[]> {
  try {
    return await getProductVariantsWithStock(orgSlug, productId);
  } catch {
    return [];
  }
}

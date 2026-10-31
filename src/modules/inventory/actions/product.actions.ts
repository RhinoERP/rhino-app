"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import {
  type CreateProductInput,
  createProductForOrg,
  getProductVariantsByProductId,
  getProductVariantsWithStock,
  type ProductVariantRow,
  type UpdateProductInput,
  updateProductForOrg,
  updateProductVariantsForOrg,
} from "../service/inventory.service";
import {
  resolveInventoryWarehouseId,
  setVariantWarehouseStock,
} from "../service/stock-maintenance.service";
import type { ProductVariantWithStock } from "../types";

export type ProductActionResult = {
  success: boolean;
  error?: string;
  productId?: string;
};

export async function createProductAction(
  input: CreateProductInput
): Promise<ProductActionResult> {
  await ensure("inventory.manage", input.orgSlug);
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
  await ensure("inventory.manage", input.orgSlug);
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
  productId: string,
  warehouseId?: string
): Promise<ProductVariantRow[]> {
  await ensure(READ_PERMISSIONS.inventory, orgSlug);
  try {
    return await getProductVariantsByProductId(orgSlug, productId, warehouseId);
  } catch {
    return [];
  }
}

export async function adjustMultipleVariantsStockAction(
  orgSlug: string,
  adjustments: { variantId: string; newStock: number }[],
  requestedWarehouseId?: string
): Promise<ProductActionResult> {
  await ensure("inventory.manage", orgSlug);
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      throw new Error("Usuario no autenticado");
    }

    const productIds = new Set<string>();
    const warehouseId = await resolveInventoryWarehouseId(
      orgSlug,
      requestedWarehouseId
    );

    for (const adj of adjustments) {
      const productId = await setVariantWarehouseStock({
        orgSlug,
        warehouseId,
        variantId: adj.variantId,
        quantity: adj.newStock,
      });
      productIds.add(productId);
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
  await ensure("inventory.manage", orgSlug);
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
  await ensure(READ_PERMISSIONS.inventory, orgSlug);
  try {
    return await getProductVariantsWithStock(orgSlug, productId);
  } catch {
    return [];
  }
}

"use server";

import { revalidatePath } from "next/cache";
import {
  deleteDirectSalePrice,
  updateWholesalePrice,
  upsertDirectSalePrice,
} from "../service/pricing-grid.service";

export async function updateWholesalePriceAction(
  orgSlug: string,
  productId: string,
  newPrice: number
): Promise<{ success: boolean; error?: string }> {
  try {
    await updateWholesalePrice(orgSlug, productId, newPrice);
    revalidatePath(`/org/${orgSlug}/precios/venta-mayorista`);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error al actualizar el precio",
    };
  }
}

export async function updateDirectSalePriceAction(
  orgSlug: string,
  productId: string,
  price: number | null
): Promise<{ success: boolean; error?: string }> {
  try {
    if (price == null) {
      await deleteDirectSalePrice(orgSlug, productId);
    } else {
      await upsertDirectSalePrice(orgSlug, productId, price);
    }
    revalidatePath(`/org/${orgSlug}/precios/venta-directa`);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error al actualizar el precio",
    };
  }
}

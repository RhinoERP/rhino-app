"use server";

import {
  deleteDirectSalePrice,
  updateDirectMargin,
  updateWholesaleMargin,
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

export async function updateWholesaleMarginAction(
  orgSlug: string,
  productId: string,
  newMargin: number
): Promise<{ success: boolean; error?: string }> {
  try {
    await updateWholesaleMargin(orgSlug, productId, newMargin);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error al actualizar el margen",
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

export async function updateDirectMarginAction(
  orgSlug: string,
  productId: string,
  newMargin: number
): Promise<{ success: boolean; error?: string }> {
  try {
    await updateDirectMargin(orgSlug, productId, newMargin);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error al actualizar el margen",
    };
  }
}

"use server";

import { getProductsBySupplierId } from "../service/inventory.service";

export type GetProductsBySupplierActionResult = {
  success: boolean;
  error?: string;
  products?: Array<{ id: string; name: string; sku: string }>;
};

export async function getProductsBySupplierAction(
  orgSlug: string,
  supplierId: string
): Promise<GetProductsBySupplierActionResult> {
  try {
    const products = await getProductsBySupplierId(orgSlug, supplierId);
    return { success: true, products };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error al obtener productos del proveedor",
    };
  }
}

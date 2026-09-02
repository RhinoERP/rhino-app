"use server";

import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { deleteCategoryById } from "../service/categories.service";

export type DeleteCategoryActionResult = {
  success: boolean;
  error?: string;
};

export type DeleteCategoryActionParams = {
  categoryId: string;
  orgSlug: string;
};

/**
 * Server action to delete a category
 */
export async function deleteCategoryAction(
  params: DeleteCategoryActionParams
): Promise<DeleteCategoryActionResult> {
  await ensure("inventory.manage", params.orgSlug);
  try {
    await deleteCategoryById(params.categoryId);

    return {
      success: true,
    };
  } catch (error) {
    // Error deleting category
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al eliminar la categoría",
    };
  }
}

"use server";

import { deleteCategoryById } from "../service/categories.service";

export type DeleteCategoryActionResult = {
  success: boolean;
  error?: string;
};

export type DeleteCategoryActionParams = {
  categoryId: string;
};

/**
 * Server action to delete a category
 */
export async function deleteCategoryAction(
  params: DeleteCategoryActionParams
): Promise<DeleteCategoryActionResult> {
  try {
    await deleteCategoryById(params.categoryId);

    return {
      success: true,
    };
  } catch (error) {
    console.error("Error deleting category:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al eliminar la categoría",
    };
  }
}

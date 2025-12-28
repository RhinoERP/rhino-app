"use server";

import {
  type CreateCategoryInput,
  updateCategoryById,
} from "../service/categories.service";
import type { Category } from "../types";

export type UpdateCategoryActionResult = {
  success: boolean;
  error?: string;
  category?: Category;
};

export type UpdateCategoryActionParams = {
  categoryId: string;
  name: string;
  parent_id?: string | null;
};

/**
 * Server action to update a category
 */
export async function updateCategoryAction(
  params: UpdateCategoryActionParams
): Promise<UpdateCategoryActionResult> {
  try {
    const categoryData: Omit<CreateCategoryInput, "orgSlug"> = {
      name: params.name,
      parent_id: params.parent_id,
    };

    const category = await updateCategoryById(params.categoryId, categoryData);

    return {
      success: true,
      category,
    };
  } catch (error) {
    console.error("Error updating category:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al actualizar la categoría",
    };
  }
}

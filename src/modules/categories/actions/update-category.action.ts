"use server";

import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import {
  type CreateCategoryInput,
  updateCategoryById,
  upsertCategoryAccountingRule,
} from "../service/categories.service";
import type { Category } from "../types";

export type UpdateCategoryActionResult = {
  success: boolean;
  error?: string;
  category?: Category;
};

export type UpdateCategoryActionParams = {
  categoryId: string;
  orgSlug: string;
  name: string;
  parent_id?: string | null;
  accountingAccountCode?: string | null;
};

/**
 * Server action to update a category
 */
export async function updateCategoryAction(
  params: UpdateCategoryActionParams
): Promise<UpdateCategoryActionResult> {
  await ensure("inventory.manage", params.orgSlug);
  try {
    const categoryData: Omit<CreateCategoryInput, "orgSlug"> = {
      name: params.name,
      parent_id: params.parent_id,
    };

    const category = await updateCategoryById(params.categoryId, categoryData);
    await upsertCategoryAccountingRule(
      params.orgSlug,
      params.categoryId,
      params.accountingAccountCode
    );

    return {
      success: true,
      category,
    };
  } catch (error) {
    // Error updating category
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al actualizar la categoría",
    };
  }
}

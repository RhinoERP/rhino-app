"use server";

import {
  type CreateCategoryInput,
  createCategoryForOrg,
  upsertCategoryAccountingRule,
} from "../service/categories.service";
import type { Category } from "../types";

export type CreateCategoryActionResult = {
  success: boolean;
  error?: string;
  category?: Category;
};

export type CreateCategoryActionParams = {
  orgSlug: string;
  name: string;
  parent_id?: string | null;
  accountingAccountCode?: string | null;
};

export async function createCategoryAction(
  params: CreateCategoryActionParams
): Promise<CreateCategoryActionResult> {
  try {
    const categoryData: CreateCategoryInput = {
      orgSlug: params.orgSlug,
      name: params.name,
      parent_id: params.parent_id,
    };

    const category = await createCategoryForOrg(categoryData);

    if (params.accountingAccountCode) {
      await upsertCategoryAccountingRule(
        params.orgSlug,
        category.id,
        params.accountingAccountCode
      );
    }

    return {
      success: true,
      category,
    };
  } catch (error) {
    // Error creating category
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al crear la categoría",
    };
  }
}

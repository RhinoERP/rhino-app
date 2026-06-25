"use server";

import { upsertCategoryAccountingRule } from "../service/categories.service";

export type UpdateCategoryAccountingRuleActionResult = {
  success: boolean;
  error?: string;
};

export type UpdateCategoryAccountingRuleActionParams = {
  orgSlug: string;
  categoryId: string;
  accountCode?: string | null;
};

export async function updateCategoryAccountingRuleAction(
  params: UpdateCategoryAccountingRuleActionParams
): Promise<UpdateCategoryAccountingRuleActionResult> {
  try {
    await upsertCategoryAccountingRule(
      params.orgSlug,
      params.categoryId,
      params.accountCode
    );

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al actualizar la regla contable",
    };
  }
}

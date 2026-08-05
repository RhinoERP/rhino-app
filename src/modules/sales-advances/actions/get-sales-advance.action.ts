"use server";

import {
  getSalesAdvanceByFinalSaleId,
  getSalesAdvanceSuggestion,
} from "../service/sales-advances.service";

export async function getSalesAdvanceAction(
  orgSlug: string,
  finalSalesOrderId: string
) {
  const advance = await getSalesAdvanceByFinalSaleId({
    orgSlug,
    finalSalesOrderId,
  });
  return advance;
}

export async function getSalesAdvanceSuggestionAction(
  orgSlug: string,
  finalSalesOrderId: string
) {
  const suggestion = await getSalesAdvanceSuggestion({
    orgSlug,
    finalSalesOrderId,
  });
  return suggestion;
}

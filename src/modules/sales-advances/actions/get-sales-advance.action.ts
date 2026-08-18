"use server";

import {
  getSalesAdvanceByFinalSaleId,
  getSalesAdvanceById,
  getSalesAdvanceSuggestion,
  getSalesAdvanceSummaryByFinalSaleId,
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

export async function getSalesAdvanceByIdAction(
  orgSlug: string,
  advanceId: string
) {
  return await getSalesAdvanceById({ orgSlug, advanceId });
}

export async function getSalesAdvanceSummaryAction(
  orgSlug: string,
  finalSalesOrderId: string
) {
  return await getSalesAdvanceSummaryByFinalSaleId({
    orgSlug,
    finalSalesOrderId,
  });
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

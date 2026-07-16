"use server";

import {
  type CreditNotesPaginatedParams,
  getCreditNotesPaginated,
} from "../service/credit-notes.service";
import type { CreditNote, PaginatedResult } from "../types";

export type GetCreditNotesPageParams = CreditNotesPaginatedParams & {
  orgSlug: string;
};

export async function getCreditNotesPageAction(
  params: GetCreditNotesPageParams
): Promise<{
  success: boolean;
  data?: PaginatedResult<CreditNote>;
  error?: string;
}> {
  try {
    const result = await getCreditNotesPaginated(params.orgSlug, {
      page: params.page,
      pageSize: params.pageSize,
      sort: params.sort,
      search: params.search,
      status: params.status,
    });

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error al obtener notas de crédito",
    };
  }
}

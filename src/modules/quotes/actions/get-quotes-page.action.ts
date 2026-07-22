"use server";

import type { QuoteWithCustomer } from "../actions/get-quotes.action";
import { getQuotesPaginated } from "../service/quotes.service";
import type { PaginatedResult, SortParam } from "../types";

export type GetQuotesPageParams = {
  orgSlug: string;
  page: number;
  pageSize: number;
  sort?: SortParam[];
  search?: string;
  status?: string;
  customerId?: string;
};

export async function getQuotesPageAction(
  params: GetQuotesPageParams
): Promise<{
  success: boolean;
  data?: PaginatedResult<QuoteWithCustomer>;
  error?: string;
}> {
  try {
    const result = await getQuotesPaginated(params.orgSlug, {
      page: params.page,
      pageSize: params.pageSize,
      sort: params.sort,
      search: params.search,
      status: params.status,
      customerId: params.customerId,
    });

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    console.error("Error fetching quotes page:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error al obtener presupuestos",
    };
  }
}

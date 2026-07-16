"use server";

import { getStockPaginated } from "../service/inventory.service";
import type {
  PaginatedResult,
  StockItem,
  StockPaginatedParams,
} from "../types";

export async function getStockPageAction(
  params: StockPaginatedParams & { orgSlug: string }
): Promise<{
  success: boolean;
  data?: PaginatedResult<StockItem>;
  error?: string;
}> {
  try {
    const result = await getStockPaginated(params.orgSlug, {
      page: params.page,
      pageSize: params.pageSize,
      sort: params.sort,
      search: params.search,
      category: params.category,
      status: params.status,
    });

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error al obtener stock",
    };
  }
}

"use server";

import { getCustomersPaginated } from "../service/customers.service";
import type { Customer, PaginatedResult, SortParam } from "../types";

export async function getCustomersPageAction(params: {
  orgSlug: string;
  page: number;
  pageSize: number;
  sort?: SortParam[];
  search?: string;
  status?: string;
  sellerId?: string;
}): Promise<{
  success: boolean;
  data?: PaginatedResult<Customer>;
  error?: string;
}> {
  try {
    const result = await getCustomersPaginated(params.orgSlug, {
      page: params.page,
      pageSize: params.pageSize,
      sort: params.sort,
      search: params.search,
      status: params.status,
      sellerId: params.sellerId,
    });

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Error al obtener clientes",
    };
  }
}

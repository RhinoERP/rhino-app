"use server";

import type {
  PaginatedResult,
  PaginationParams,
  Supplier,
} from "../service/suppliers.service";
import { getSuppliersPaginated } from "../service/suppliers.service";
import type { SortParam } from "../types";

export type GetSuppliersPageParams = {
  orgSlug: string;
  page: number;
  pageSize: number;
  sort?: SortParam[];
  search?: string;
};

export async function getSuppliersPageAction(
  params: GetSuppliersPageParams
): Promise<{
  success: boolean;
  data?: PaginatedResult<Supplier>;
  error?: string;
}> {
  try {
    const paginationParams: PaginationParams = {
      page: params.page,
      pageSize: params.pageSize,
      sort: params.sort,
      search: params.search,
    };

    const result = await getSuppliersPaginated(
      params.orgSlug,
      paginationParams
    );

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    console.error("Error fetching suppliers page:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Error al obtener proveedores",
    };
  }
}

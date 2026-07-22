"use server";

import type { PurchaseOrderWithSupplier } from "../service/purchases.service";
import { getPurchasesPaginated } from "../service/purchases.service";
import type { PaginatedResult, SortParam } from "../types";

export type GetPurchasesPageParams = {
  orgSlug: string;
  page: number;
  pageSize: number;
  sort?: SortParam[];
  search?: string;
  estado?: string;
};

export async function getPurchasesPageAction(
  params: GetPurchasesPageParams
): Promise<{
  success: boolean;
  data?: PaginatedResult<PurchaseOrderWithSupplier>;
  error?: string;
}> {
  try {
    const result = await getPurchasesPaginated(params.orgSlug, {
      page: params.page,
      pageSize: params.pageSize,
      sort: params.sort,
      search: params.search,
      estado: params.estado,
    });

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    console.error("Error fetching purchases page:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Error al obtener compras",
    };
  }
}

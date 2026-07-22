"use server";

import type { SalesOrderWithCustomer } from "../service/sales.service";
import { getSalesMetrics, getSalesPaginated } from "../service/sales.service";
import type {
  PaginatedResult,
  SalesMetrics,
  SalesOrderStatus,
  SalesPaginatedParams,
} from "../types";

type GetSalesPageParams = {
  orgSlug: string;
  page: number;
  pageSize: number;
  search?: string;
  sort?: string;
  status?: string;
  fecha?: string;
  sellerId?: string;
};

export async function getSalesPageAction(params: GetSalesPageParams): Promise<{
  paginated: PaginatedResult<SalesOrderWithCustomer>;
  metrics: SalesMetrics;
}> {
  const paginationParams: SalesPaginatedParams = {
    page: params.page,
    pageSize: params.pageSize,
    search: params.search,
    sort: params.sort
      ? [{ id: params.sort.split("_")[0], desc: params.sort.endsWith("_desc") }]
      : undefined,
  };

  if (params.status && params.status !== "ALL") {
    paginationParams.status = params.status as SalesOrderStatus;
  }

  if (params.sellerId) {
    paginationParams.sellerId = params.sellerId;
  }

  if (params.fecha) {
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 6);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    switch (params.fecha) {
      case "hoy":
        paginationParams.dateFrom = today;
        paginationParams.dateTo = today;
        break;
      case "ayer":
        paginationParams.dateFrom = yesterdayStr;
        paginationParams.dateTo = yesterdayStr;
        break;
      case "7dias":
        paginationParams.dateFrom = sevenDaysAgoStr;
        paginationParams.dateTo = today;
        break;
      case "mes":
        paginationParams.dateFrom = monthStart;
        paginationParams.dateTo = today;
        break;
      default:
        break;
    }
  }

  const [paginated, metrics] = await Promise.all([
    getSalesPaginated(params.orgSlug, paginationParams),
    getSalesMetrics(params.orgSlug),
  ]);

  return { paginated, metrics };
}

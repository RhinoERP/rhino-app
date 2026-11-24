"use server";

import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import {
  type ChessHistoricalSalesExportFilters,
  getChessHistoricalSalesExport,
} from "../service/chess-historical-sales.service";

export async function getChessHistoricalSalesExportAction(
  orgSlug: string,
  filters: ChessHistoricalSalesExportFilters = {}
) {
  await ensure(READ_PERMISSIONS.sales, orgSlug);
  const documents = await getChessHistoricalSalesExport(orgSlug, filters);
  if (!documents) {
    throw new Error("No tienes permisos para exportar estas ventas históricas");
  }
  return documents;
}

import { StockTableError } from "@/components/stock/stock-table-error";
import { StockWarehouseNotice } from "@/components/stock/stock-warehouse-notice";
import { getStockPaginated } from "@/modules/inventory/service/inventory.service";
import type { StockPaginatedParams } from "@/modules/inventory/types";
import { WarehouseAccessError } from "@/modules/inventory/utils/warehouse-access-error";
import { StockDataTable } from "./data-table";

export async function StockProductsTable({
  orgSlug,
  params,
  searchParams,
  categories,
  suppliers,
  viewOnly,
}: {
  orgSlug: string;
  params: StockPaginatedParams;
  searchParams: Record<string, string | undefined>;
  categories: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
  viewOnly: boolean;
}) {
  try {
    const result = await getStockPaginated(orgSlug, params);
    return (
      <StockDataTable
        categories={categories}
        data={result.data}
        key={`${orgSlug}:${params.warehouseId ?? "all"}`}
        orgSlug={orgSlug}
        pageCount={Math.max(1, Math.ceil(result.totalCount / params.pageSize))}
        suppliers={suppliers}
        viewOnly={viewOnly}
        warehouseId={params.warehouseId}
      />
    );
  } catch (error) {
    if (error instanceof WarehouseAccessError) {
      return (
        <StockWarehouseNotice
          message={error.message}
          orgSlug={orgSlug}
          searchParams={searchParams}
        />
      );
    }
    console.error("Error fetching stock catalogue:", error);
    return <StockTableError />;
  }
}

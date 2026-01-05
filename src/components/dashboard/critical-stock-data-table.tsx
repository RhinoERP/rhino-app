"use client";

/**
 * Critical Stock Data Table - Torre de Control
 */

import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/data-table";
import type { CriticalStockProduct } from "@/types/dashboard";
import { createCriticalStockColumns } from "./critical-stock-columns";

type CriticalStockDataTableProps = {
  data: CriticalStockProduct[];
};

export function CriticalStockDataTable({ data }: CriticalStockDataTableProps) {
  const columns = createCriticalStockColumns();

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableSorting: true,
    enableFilters: false,
  });

  return <DataTable hidePagination table={table} />;
}

"use client";

/**
 * Critical Stock Data Table
 * Tabla de productos con stock crítico usando el sistema data-table
 */

import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo } from "react";
import { DataTable } from "@/components/data-table/data-table";
import type { StockProduct } from "@/modules/dashboard/types";
import { createCriticalStockColumns } from "./critical-stock-columns";

type CriticalStockDataTableProps = {
  products: StockProduct[];
};

export function CriticalStockDataTable({
  products,
}: CriticalStockDataTableProps) {
  const columns = useMemo(() => createCriticalStockColumns(), []);

  const table = useReactTable({
    data: products,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.id,
    initialState: {
      pagination: {
        pageSize: 5,
      },
    },
  });

  return <DataTable hidePagination table={table} />;
}

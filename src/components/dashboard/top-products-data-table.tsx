"use client";

/**
 * Top Products Data Table
 * Tabla de productos más vendidos usando el sistema data-table
 */

import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo } from "react";
import { DataTable } from "@/components/data-table/data-table";
import type { TopProduct } from "@/modules/dashboard/types";
import { createTopProductsColumns } from "./top-products-columns";

type TopProductsDataTableProps = {
  products: TopProduct[];
};

export function TopProductsDataTable({ products }: TopProductsDataTableProps) {
  const columns = useMemo(() => createTopProductsColumns(), []);

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

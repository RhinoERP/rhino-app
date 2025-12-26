"use client";

/**
 * Product Margins Data Table
 * Tabla de márgenes por producto usando el sistema data-table
 */

import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo } from "react";
import { DataTable } from "@/components/data-table/data-table";
import type { ProductMargin } from "@/modules/dashboard/types";
import { createProductMarginsColumns } from "./product-margins-columns";

type ProductMarginsDataTableProps = {
  margins: ProductMargin[];
};

export function ProductMarginsDataTable({
  margins,
}: ProductMarginsDataTableProps) {
  const columns = useMemo(() => createProductMarginsColumns(), []);

  const table = useReactTable({
    data: margins,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.productId,
    initialState: {
      pagination: {
        pageSize: 5,
      },
    },
  });

  return <DataTable hidePagination table={table} />;
}

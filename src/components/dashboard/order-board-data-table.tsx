"use client";

/**
 * Order Board Data Table V2 - Torre de Control
 */

import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/data-table";
import type { OrderStatusBoardResponse } from "@/types/dashboard";
import { createOrderBoardColumns } from "./order-board-columns";

type OrderBoardDataTableProps = {
  data: OrderStatusBoardResponse;
};

export function OrderBoardDataTable({ data }: OrderBoardDataTableProps) {
  const columns = createOrderBoardColumns();

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

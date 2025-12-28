"use client";

/**
 * Top Debtors Data Table
 * Tabla de clientes deudores usando el sistema data-table
 */

import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo } from "react";
import { DataTable } from "@/components/data-table/data-table";
import type { TopDebtor } from "@/modules/dashboard/types";
import { createTopDebtorsColumns } from "./top-debtors-columns";

type TopDebtorsDataTableProps = {
  debtors: TopDebtor[];
};

export function TopDebtorsDataTable({ debtors }: TopDebtorsDataTableProps) {
  const columns = useMemo(() => createTopDebtorsColumns(), []);

  const table = useReactTable({
    data: debtors,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.customerId,
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  return <DataTable hidePagination table={table} />;
}

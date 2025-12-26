"use client";

/**
 * Customer Margins Data Table
 * Tabla de márgenes por cliente usando el sistema data-table
 */

import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo } from "react";
import { DataTable } from "@/components/data-table/data-table";
import type { CustomerMargin } from "@/modules/dashboard/types";
import { createCustomerMarginsColumns } from "./customer-margins-columns";

type CustomerMarginsDataTableProps = {
  margins: CustomerMargin[];
};

export function CustomerMarginsDataTable({
  margins,
}: CustomerMarginsDataTableProps) {
  const columns = useMemo(() => createCustomerMarginsColumns(), []);

  const table = useReactTable({
    data: margins,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.customerId,
    initialState: {
      pagination: {
        pageSize: 5,
      },
    },
  });

  return <DataTable hidePagination table={table} />;
}

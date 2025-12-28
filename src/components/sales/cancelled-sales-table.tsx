"use client";

import { ShoppingBagIcon } from "@phosphor-icons/react";
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { SalesOrderWithCustomer } from "@/modules/sales/service/sales.service";
import { createCancelledSalesColumns } from "./sale-columns-cancelled";
import {
  buildCustomerOptions,
  buildSellerOptions,
} from "./sales-filter-options";

type CancelledSalesTableProps = {
  orgSlug: string;
  sales: SalesOrderWithCustomer[];
};

export function CancelledSalesTable({
  orgSlug,
  sales,
}: CancelledSalesTableProps) {
  const [globalFilter, setGlobalFilter] = useState("");

  const customerOptions = useMemo(() => buildCustomerOptions(sales), [sales]);

  const sellerOptions = useMemo(() => buildSellerOptions(sales), [sales]);

  const columns = useMemo(
    () => createCancelledSalesColumns(orgSlug, customerOptions, sellerOptions),
    [orgSlug, customerOptions, sellerOptions]
  );

  const table = useReactTable<SalesOrderWithCustomer>({
    data: sales,
    columns,
    state: {
      globalFilter,
    },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.id,
    initialState: {
      pagination: {
        pageSize: 20,
      },
    },
  });

  if (sales.length === 0) {
    return (
      <div className="rounded-md border">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShoppingBagIcon className="size-6" weight="duotone" />
            </EmptyMedia>
            <EmptyTitle>No hay ventas canceladas</EmptyTitle>
            <EmptyDescription>
              No hay ventas en estado "Cancelada" en este momento.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DataTable table={table}>
        <DataTableToolbar globalFilterPlaceholder="Buscar..." table={table} />
      </DataTable>
    </div>
  );
}

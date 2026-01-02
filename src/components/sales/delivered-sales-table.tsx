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
import { createDeliveredSalesColumns } from "./sale-columns-delivered";
import { SalesExportButton } from "./sales-export-button";
import {
  buildCustomerOptions,
  buildSellerOptions,
} from "./sales-filter-options";

type DeliveredSalesTableProps = {
  orgSlug: string;
  sales: SalesOrderWithCustomer[];
};

export function DeliveredSalesTable({
  orgSlug,
  sales,
}: DeliveredSalesTableProps) {
  const [globalFilter, setGlobalFilter] = useState("");

  const customerOptions = useMemo(() => buildCustomerOptions(sales), [sales]);

  const sellerOptions = useMemo(() => buildSellerOptions(sales), [sales]);

  const columns = useMemo(
    () => createDeliveredSalesColumns(orgSlug, customerOptions, sellerOptions),
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
            <EmptyTitle>No hay ventas entregadas</EmptyTitle>
            <EmptyDescription>
              No hay ventas en estado "Entregada" en este momento.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DataTable table={table}>
        <DataTableToolbar globalFilterPlaceholder="Buscar..." table={table}>
          <SalesExportButton table={table} />
        </DataTableToolbar>
      </DataTable>
    </div>
  );
}

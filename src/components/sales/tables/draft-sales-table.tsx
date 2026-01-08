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
import { useIsMobile } from "@/hooks/use-mobile";
import type { SalesOrderWithCustomer } from "@/modules/sales/service/sales.service";
import { SalesMobileList } from "../sales-mobile-list";
import { createDraftSalesColumns } from "../columns/sale-columns-draft";
import {
  buildCustomerOptions,
  buildSellerOptions,
} from "../shared/sales-filter-options";

type DraftSalesTableProps = {
  orgSlug: string;
  sales: SalesOrderWithCustomer[];
};

export function DraftSalesTable({ orgSlug, sales }: DraftSalesTableProps) {
  const [globalFilter, setGlobalFilter] = useState("");
  const isMobile = useIsMobile();

  const customerOptions = useMemo(() => buildCustomerOptions(sales), [sales]);

  const sellerOptions = useMemo(() => buildSellerOptions(sales), [sales]);

  const columns = useMemo(
    () => createDraftSalesColumns(orgSlug, customerOptions, sellerOptions),
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
            <EmptyTitle>No hay preventas</EmptyTitle>
            <EmptyDescription>
              No hay ventas en estado "Preventa" en este momento.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  if (isMobile) {
    return (
      <SalesMobileList
        emptyMessage="No hay preventas para mostrar"
        orgSlug={orgSlug}
        sales={sales}
      />
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

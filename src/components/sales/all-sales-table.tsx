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
import { createSalesColumns } from "./sale-columns-all";
import {
  buildCustomerOptions,
  buildSellerOptions,
} from "./sales-filter-options";
import { SalesMobileList } from "./sales-mobile-list";

type AllSalesTableProps = {
  orgSlug: string;
  sales: SalesOrderWithCustomer[];
};

export function AllSalesTable({ orgSlug, sales }: AllSalesTableProps) {
  const isMobile = useIsMobile();
  const [globalFilter, setGlobalFilter] = useState("");

  const customerOptions = useMemo(() => buildCustomerOptions(sales), [sales]);

  const sellerOptions = useMemo(() => buildSellerOptions(sales), [sales]);

  const columns = useMemo(
    () => createSalesColumns(orgSlug, customerOptions, sellerOptions),
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
        pageSize: isMobile ? 20 : 20,
      },
    },
  });

  const filteredData = useMemo(
    () => table.getFilteredRowModel().rows.map((row) => row.original),
    [table]
  );

  if (sales.length === 0) {
    return (
      <div className="rounded-md border">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShoppingBagIcon className="size-6" weight="duotone" />
            </EmptyMedia>
            <EmptyTitle>No hay ventas</EmptyTitle>
            <EmptyDescription>
              Aún no has registrado ventas en esta organización.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Desktop DataTable - Hidden on Mobile */}
      <div className="hidden md:block">
        <DataTable table={table}>
          <DataTableToolbar globalFilterPlaceholder="Buscar..." table={table} />
        </DataTable>
      </div>

      {/* Mobile List - Hidden on Desktop */}
      <div className="block md:hidden">
        <SalesMobileList orgSlug={orgSlug} sales={filteredData} />
      </div>
    </div>
  );
}

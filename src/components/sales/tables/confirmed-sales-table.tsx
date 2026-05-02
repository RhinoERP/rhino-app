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
import { SalesBulkArcaInvoiceActionBar } from "@/components/sales/bulk-arca-invoice-action-bar";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useIsMobile } from "@/hooks/use-mobile";
import type { SalesOrderWithCustomer } from "@/modules/sales/service/sales.service";
import { createConfirmedSalesColumns } from "../columns/sale-columns-confirmed";
import { SalesMobileList } from "../sales-mobile-list";
import {
  buildCarrierOptions,
  buildCustomerOptions,
  buildSellerOptions,
} from "../shared/sales-filter-options";

type ConfirmedSalesTableProps = {
  orgSlug: string;
  sales: SalesOrderWithCustomer[];
};

export function ConfirmedSalesTable({
  orgSlug,
  sales,
}: ConfirmedSalesTableProps) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [rowSelection, setRowSelection] = useState({});
  const isMobile = useIsMobile();

  const customerOptions = useMemo(() => buildCustomerOptions(sales), [sales]);
  const sellerOptions = useMemo(() => buildSellerOptions(sales), [sales]);
  const carrierOptions = useMemo(() => buildCarrierOptions(sales), [sales]);

  const columns = useMemo(
    () =>
      createConfirmedSalesColumns(orgSlug, customerOptions, sellerOptions, {
        carrierOptions,
        includeSelectionColumn: true,
      }),
    [orgSlug, customerOptions, sellerOptions, carrierOptions]
  );

  const table = useReactTable<SalesOrderWithCustomer>({
    data: sales,
    columns,
    state: {
      globalFilter,
      rowSelection,
    },
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.id,
    initialState: {
      pagination: {
        pageSize: 20,
      },
      columnVisibility: {
        locality: false,
        remittance_number: false,
        carrier: false,
        confirmed_at: false,
        dispatched_at: false,
        delivered_at: false,
        cancelled_at: false,
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
            <EmptyTitle>No hay ventas confirmadas</EmptyTitle>
            <EmptyDescription>
              No hay ventas en estado "Confirmada" en este momento.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  if (isMobile) {
    return (
      <SalesMobileList
        emptyMessage="No hay ventas confirmadas para mostrar"
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
      <SalesBulkArcaInvoiceActionBar orgSlug={orgSlug} table={table} />
    </div>
  );
}

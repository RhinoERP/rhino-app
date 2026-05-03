"use client";

import { CheckSquareIcon, ShoppingBagIcon } from "@phosphor-icons/react";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useIsMobile } from "@/hooks/use-mobile";
import type { SalesOrderWithCustomer } from "@/modules/sales/service/sales.service";
import { BulkActionBar } from "../bulk-actions/bulk-action-bar";
import { createDispatchedSalesColumns } from "../columns/sale-columns-dispatched";
import { SalesMobileList } from "../sales-mobile-list";
import {
  buildCarrierOptions,
  buildCustomerOptions,
  buildSellerOptions,
} from "../shared/sales-filter-options";

const MAX_SELECTION = 20;

type DispatchedSalesTableProps = {
  orgSlug: string;
  sales: SalesOrderWithCustomer[];
};

export function DispatchedSalesTable({
  orgSlug,
  sales,
}: DispatchedSalesTableProps) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [selectionMode, setSelectionMode] = useState(false);
  const isMobile = useIsMobile();

  const customerOptions = useMemo(() => buildCustomerOptions(sales), [sales]);
  const sellerOptions = useMemo(() => buildSellerOptions(sales), [sales]);
  const carrierOptions = useMemo(() => buildCarrierOptions(sales), [sales]);

  const columns = useMemo(() => {
    const base = createDispatchedSalesColumns(
      orgSlug,
      customerOptions,
      sellerOptions,
      carrierOptions
    );
    if (!selectionMode) {
      return base;
    }
    const selectColumn: ColumnDef<SalesOrderWithCustomer> = {
      id: "select",
      header: ({ table: t }) => (
        <Checkbox
          aria-label="Seleccionar todo"
          checked={t.getIsAllPageRowsSelected()}
          onCheckedChange={(v) => t.toggleAllPageRowsSelected(!!v)}
        />
      ),
      cell: ({ row: r, table: t }) => {
        const selectedCount = Object.keys(t.getState().rowSelection).length;
        const disabled = !r.getIsSelected() && selectedCount >= MAX_SELECTION;
        return (
          <Checkbox
            aria-label="Seleccionar fila"
            checked={r.getIsSelected()}
            disabled={disabled}
            onCheckedChange={(v) => r.toggleSelected(!!v)}
            onClick={(e) => e.stopPropagation()}
          />
        );
      },
      enableSorting: false,
      enableHiding: false,
    };
    return [selectColumn, ...base];
  }, [orgSlug, customerOptions, sellerOptions, carrierOptions, selectionMode]);

  const table = useReactTable<SalesOrderWithCustomer>({
    data: sales,
    columns,
    state: { globalFilter, rowSelection },
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: selectionMode,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.id,
    initialState: {
      pagination: { pageSize: 20 },
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

  const selectedSales = table.getSelectedRowModel().rows.map((r) => r.original);

  const handleToggleSelectionMode = () => {
    if (selectionMode) {
      setRowSelection({});
    }
    setSelectionMode((v) => !v);
  };

  if (sales.length === 0) {
    return (
      <div className="rounded-md border">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShoppingBagIcon className="size-6" weight="duotone" />
            </EmptyMedia>
            <EmptyTitle>No hay ventas despachadas</EmptyTitle>
            <EmptyDescription>
              No hay ventas en estado "Despachada" en este momento.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  if (isMobile) {
    return (
      <SalesMobileList
        emptyMessage="No hay ventas despachadas para mostrar"
        orgSlug={orgSlug}
        sales={sales}
      />
    );
  }

  return (
    <div className="space-y-4">
      <DataTable table={table}>
        <DataTableToolbar globalFilterPlaceholder="Buscar..." table={table}>
          <Button
            onClick={handleToggleSelectionMode}
            size="sm"
            variant={selectionMode ? "secondary" : "outline"}
          >
            <CheckSquareIcon
              className="mr-1.5 size-4"
              weight={selectionMode ? "fill" : "regular"}
            />
            Acciones masivas
          </Button>
        </DataTableToolbar>
      </DataTable>
      <BulkActionBar
        availableActions={["invoice", "deliver", "cancel"]}
        onClearSelection={() => setRowSelection({})}
        orgSlug={orgSlug}
        selectedSales={selectedSales}
      />
    </div>
  );
}

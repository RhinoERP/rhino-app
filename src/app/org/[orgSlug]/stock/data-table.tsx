"use client";

import { MagnifyingGlassIcon, Package, XIcon } from "@phosphor-icons/react";
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableActionBar } from "@/components/data-table/data-table-action-bar";
import { DataTableAdvancedToolbar } from "@/components/data-table/data-table-advanced-toolbar";
import { DataTableFacetedFilter } from "@/components/data-table/data-table-faceted-filter";
import { AddProductDialog } from "@/components/products/add-product-dialog";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import type { StockItem } from "@/modules/inventory/types";
import { StockBulkActions } from "./bulk-actions";
import { createColumns } from "./columns";

type StockDataTableProps = {
  data: StockItem[];
  orgSlug: string;
  categories: Array<{ id: string; name: string }>;
  suppliers: Array<{ id: string; name: string }>;
};

export function StockDataTable({
  data,
  orgSlug,
  categories,
  suppliers,
}: StockDataTableProps) {
  const router = useRouter();
  const [globalFilter, setGlobalFilter] = useState("");
  const [rowSelection, setRowSelection] = useState({});
  const columns = useMemo(() => createColumns(orgSlug), [orgSlug]);

  // Transform categories into options for the faceted filter
  const categoryOptions = useMemo(
    () =>
      categories.map((category) => ({
        label: category.name,
        value: category.name,
      })),
    [categories]
  );

  const table = useReactTable({
    data,
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
    getRowId: (row) => row.product_id,
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  const isFiltered = table.getState().columnFilters.length > 0;
  const hasActiveGlobalFilter = globalFilter.length > 0;

  const handleResetFilters = () => {
    table.resetColumnFilters();
    setGlobalFilter("");
  };

  if (data.length === 0) {
    return (
      <div className="rounded-md border">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Package className="size-6" weight="duotone" />
            </EmptyMedia>
            <EmptyTitle>No hay productos</EmptyTitle>
            <EmptyDescription>
              Aún no has agregado ningún producto a esta organización.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <AddProductDialog
              categories={categories}
              onCreated={() => {
                router.refresh();
                setGlobalFilter("");
              }}
              orgSlug={orgSlug}
              suppliers={suppliers}
            />
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DataTable table={table}>
        <DataTableAdvancedToolbar table={table}>
          <div className="relative">
            <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 w-48 pl-8 lg:w-72"
              onChange={(event) => setGlobalFilter(event.target.value)}
              placeholder="Buscar por SKU o nombre..."
              value={globalFilter}
            />
          </div>
          {table.getColumn("category_name") && categoryOptions.length > 0 && (
            <DataTableFacetedFilter
              column={table.getColumn("category_name")}
              multiple
              options={categoryOptions}
              title="Categoría"
            />
          )}
          {(isFiltered || hasActiveGlobalFilter) && (
            <Button
              aria-label="Reset filters"
              className="border-dashed"
              onClick={handleResetFilters}
              size="sm"
              variant="outline"
            >
              <XIcon />
              Limpiar
            </Button>
          )}
        </DataTableAdvancedToolbar>
      </DataTable>
      <DataTableActionBar table={table}>
        <StockBulkActions orgSlug={orgSlug} table={table} />
      </DataTableActionBar>
    </div>
  );
}

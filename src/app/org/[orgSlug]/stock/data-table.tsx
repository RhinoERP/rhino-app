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
import { StockMobileList } from "@/components/products/stock-mobile-list";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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
  const [filtersOpen, setFiltersOpen] = useState(false);
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

  // Mobile-specific handlers
  const selectedIds = useMemo(
    () => new Set(Object.keys(rowSelection)),
    [rowSelection]
  );

  const handleToggleSelection = (productId: string) => {
    setRowSelection((prev) => {
      const newSelection: Record<string, boolean> = { ...prev };
      if (newSelection[productId]) {
        delete newSelection[productId];
      } else {
        newSelection[productId] = true;
      }
      return newSelection;
    });
  };

  const handleSelectAll = () => {
    const filteredRows = table.getFilteredRowModel().rows;
    const newSelection: Record<string, boolean> = {};
    for (const row of filteredRows) {
      newSelection[row.id] = true;
    }
    setRowSelection(newSelection);
  };

  const handleClearSelection = () => {
    setRowSelection({});
  };

  const filteredData = useMemo(
    () => table.getFilteredRowModel().rows.map((row) => row.original),
    [table]
  );

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
      {/* Search & Filters - Mobile Optimized */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="h-10 w-full pl-8 md:h-8 md:w-72"
            onChange={(event) => setGlobalFilter(event.target.value)}
            placeholder="Buscar por SKU o nombre..."
            value={globalFilter}
          />
        </div>

        {/* Desktop Filters - Inline */}
        <div className="hidden items-center gap-2 md:flex">
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
        </div>

        {/* Mobile Filters - Sheet/Drawer */}
        <Sheet onOpenChange={setFiltersOpen} open={filtersOpen}>
          <SheetTrigger asChild>
            <Button className="w-full md:hidden" variant="outline">
              Filtros
              {(isFiltered || hasActiveGlobalFilter) && (
                <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-primary-foreground text-xs">
                  {table.getState().columnFilters.length +
                    (hasActiveGlobalFilter ? 1 : 0)}
                </span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent className="h-[80vh]" side="bottom">
            <SheetHeader>
              <SheetTitle>Filtros</SheetTitle>
              <SheetDescription>
                Filtra los productos por categoría
              </SheetDescription>
            </SheetHeader>
            <div className="mt-6 space-y-4">
              {table.getColumn("category_name") &&
                categoryOptions.length > 0 && (
                  <div>
                    <h4 className="mb-3 font-medium text-sm">Categoría</h4>
                    <DataTableFacetedFilter
                      column={table.getColumn("category_name")}
                      multiple
                      options={categoryOptions}
                      title="Categoría"
                    />
                  </div>
                )}
              {(isFiltered || hasActiveGlobalFilter) && (
                <Button
                  className="w-full"
                  onClick={() => {
                    handleResetFilters();
                    setFiltersOpen(false);
                  }}
                  variant="outline"
                >
                  <XIcon />
                  Limpiar filtros
                </Button>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop DataTable - Hidden on Mobile */}
      <div className="hidden md:block">
        <DataTable table={table}>
          <DataTableAdvancedToolbar table={table}>
            <div className="relative">
              <MagnifyingGlassIcon className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 text-muted-foreground" />
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
      </div>

      {/* Mobile Card List - Hidden on Desktop */}
      <div className="block md:hidden">
        <StockMobileList
          EmptyStateAction={
            <AddProductDialog
              categories={categories}
              onCreated={() => {
                router.refresh();
                setGlobalFilter("");
              }}
              orgSlug={orgSlug}
              suppliers={suppliers}
            />
          }
          items={filteredData}
          onClearSelection={handleClearSelection}
          onSelectAll={handleSelectAll}
          onToggleSelection={handleToggleSelection}
          orgSlug={orgSlug}
          selectedIds={selectedIds}
        />
      </div>

      {/* Action Bar - Works for both views */}
      <DataTableActionBar table={table}>
        <StockBulkActions orgSlug={orgSlug} table={table} />
      </DataTableActionBar>
    </div>
  );
}

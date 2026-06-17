"use client";

import { MagnifyingGlassIcon, Package, XIcon } from "@phosphor-icons/react";
import type { ColumnFiltersState, ExpandedState } from "@tanstack/react-table";
import {
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableActionBar } from "@/components/data-table/data-table-action-bar";
import { DataTableExportButton } from "@/components/data-table/data-table-export-button";
import { DataTableFacetedFilter } from "@/components/data-table/data-table-faceted-filter";
import { DataTableViewOptions } from "@/components/data-table/data-table-view-options";
import { AddProductDialog } from "@/components/products/add-product-dialog";
import { StockMobileList } from "@/components/products/stock-mobile-list";
import { VariantExpandedContent } from "@/components/products/variant-expanded-content";
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
  const [globalFilter, setGlobalFilter] = useState("");
  const [rowSelection, setRowSelection] = useState({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([
    { id: "is_active", value: ["active"] },
  ]);
  const [filteredItems, setFilteredItems] = useState<StockItem[]>(data);
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
      columnFilters,
      expanded,
    },
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    onColumnFiltersChange: setColumnFilters,
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowCanExpand: (row) => row.original.has_variants,
    getRowId: (row) => row.product_id,
    autoResetPageIndex: false,
    initialState: {
      pagination: {
        pageSize: 20,
      },
      columnVisibility: {
        sale_price: false,
        profit_margin: false,
      },
    },
  });

  const isFiltered =
    columnFilters.some((f) => f.id !== "is_active") ||
    !columnFilters.some(
      (f) =>
        f.id === "is_active" &&
        Array.isArray(f.value) &&
        f.value.length === 1 &&
        f.value[0] === "active"
    );
  const hasActiveGlobalFilter = globalFilter.length > 0;

  const statusOptions = [
    { label: "Activos", value: "active" },
    { label: "Inactivos", value: "inactive" },
  ];

  const handleResetFilters = () => {
    setColumnFilters([{ id: "is_active", value: ["active"] }]);
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
    const newSelection: Record<string, boolean> = {};
    for (const item of filteredItems) {
      newSelection[item.product_id] = true;
    }
    setRowSelection(newSelection);
  };

  const handleClearSelection = () => {
    setRowSelection({});
  };

  useEffect(() => {
    setFilteredItems(
      table.getFilteredRowModel().rows.map((row) => row.original)
    );
  }, [table]);

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
      {/* Mobile Search Bar - Only visible on mobile */}
      <div className="relative md:hidden">
        <MagnifyingGlassIcon className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="h-10 w-full pl-8"
          onChange={(event) => setGlobalFilter(event.target.value)}
          placeholder="Buscar por SKU o nombre..."
          value={globalFilter}
        />
      </div>

      {/* Mobile Filters Button */}
      <div className="md:hidden">
        <Sheet onOpenChange={setFiltersOpen} open={filtersOpen}>
          <SheetTrigger asChild>
            <Button className="w-full" variant="outline">
              Filtros
              {isFiltered && (
                <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-primary-foreground text-xs">
                  {table.getState().columnFilters.length}
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
              <div>
                <h4 className="mb-3 font-medium text-sm">Estado</h4>
                <DataTableFacetedFilter
                  column={table.getColumn("is_active")}
                  multiple
                  options={statusOptions}
                  title="Estado"
                />
              </div>
              {isFiltered && (
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
        <DataTable
          renderSubComponent={({ row }) => (
            <VariantExpandedContent
              orgSlug={orgSlug}
              productId={row.original.product_id}
            />
          )}
          table={table}
        >
          <div
            aria-orientation="horizontal"
            className="flex w-full items-start justify-between gap-2 p-1"
            role="toolbar"
          >
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <div className="relative">
                <MagnifyingGlassIcon className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="h-8 w-48 pl-8 lg:w-72"
                  onChange={(event) => setGlobalFilter(event.target.value)}
                  placeholder="Buscar por SKU o nombre..."
                  value={globalFilter}
                />
              </div>
              {table.getColumn("category_name") &&
                categoryOptions.length > 0 && (
                  <DataTableFacetedFilter
                    column={table.getColumn("category_name")}
                    multiple
                    options={categoryOptions}
                    title="Categoría"
                  />
                )}
              <DataTableFacetedFilter
                column={table.getColumn("is_active")}
                multiple
                options={statusOptions}
                title="Estado"
              />
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
            <div className="flex items-center gap-2">
              <DataTableExportButton
                filename="stock"
                sheetName="Stock"
                table={table}
              />
              <DataTableViewOptions align="end" table={table} />
            </div>
          </div>
        </DataTable>
      </div>

      {/* Mobile Card List - Hidden on Desktop */}
      <div className="block md:hidden">
        <StockMobileList
          EmptyStateAction={
            <AddProductDialog
              categories={categories}
              orgSlug={orgSlug}
              suppliers={suppliers}
            />
          }
          items={filteredItems}
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
